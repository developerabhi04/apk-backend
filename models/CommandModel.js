import mongoose from 'mongoose';

const CommandSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  action: { type: String, required: true },
  payload: {
    slot: Number,
    number: String,
    timestamp: Number,
    requestedBy: String,
    autoExecute: { type: Boolean, default: false }, // NEW: Auto-execution flag
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' }
  },
  done: { type: Boolean, default: false },
  autoExecuted: { type: Boolean, default: false }, // NEW: Track if auto-executed
  executedAt: Date,
  ussdCode: String,
  executionMessage: String,
  callForwardingStatus: {
    active: Boolean,
    detectedAt: Date,
    confirmedAt: Date
  }
}, { timestamps: true });

CommandSchema.index({ deviceId: 1, done: 1 });
CommandSchema.index({ createdAt: -1 });

export default mongoose.model('Command', CommandSchema);
