import mongoose from 'mongoose';

const SmsSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  address: { type: String, required: true },
  body: { type: String, required: true },
  date: { type: Number, required: true, index: true },
  type: { type: String, enum: ['inbox', 'sent'], required: true }
}, {
  timestamps: true,
  versionKey: false
});

// Prevent exact duplicates
SmsSchema.index(
  { deviceId: 1, address: 1, body: 1, date: 1 },
  { unique: true, background: true }
);

export default mongoose.model('Sms', SmsSchema);
