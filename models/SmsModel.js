import mongoose from 'mongoose';

const SmsSchema = new mongoose.Schema({
  deviceId: String,
  address: String,
  body: String,
  date: Number,
  type: String
});

SmsSchema.index({ deviceId: 1, address: 1, body: 1, date: 1 }, { unique: true });

export default mongoose.model('Sms', SmsSchema);
