import mongoose from 'mongoose';

const CommandSchema = new mongoose.Schema({
  deviceId: String,
  action: String,
  payload: Object,
  done: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Command', CommandSchema);
