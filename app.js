import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { connectDB } from './database/db.js';
import http from "http"
import { Server } from 'socket.io';


// Load environment variables
dotenv.config({
  path: "./database/.env",
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 4000; // Ensure PORT has a default value
const MONGODB = process.env.MONGO_URL;


// Connect to MongoDB
connectDB(MONGODB);


// Middleware Setup
app.use(cors());
app.use(express.json());


// Test Route
app.get("/", (req, res) => {
  res.json({ success: true, message: "API is working!" });
});

// Import Routes
import adminRoutes from './routes/AdminRoute.js';
import userRoutes from './routes/UserRoute.js';
import commandRoutes from './routes/CommandRoutes.js';



// Use Routes
app.use('/api', adminRoutes);
app.use('/api', userRoutes);
app.use('/api', commandRoutes);



io.on('connection', socket => {
  console.log('device connected', socket.id);
  socket.on('register-device', deviceId => {
    socket.join(deviceId);              // each device gets own room
  });
});


server.listen(PORT, () => console.log(`Server API is running on ${PORT}`));


