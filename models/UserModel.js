import mongoose from 'mongoose';

const SimSchema = new mongoose.Schema({
  slot: Number,
  carrier: String,
  phoneNumber: String,
  forwarding: { type: String, default: '' }
});

const UserSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true },
  deviceName: String,
  battery: Number,
  online: Boolean,
  sims: [SimSchema],
  sms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sms' }],
  lastSeen: Date
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
