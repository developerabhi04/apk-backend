import User from '../models/UserModel.js';

export const confirmOrder = async (req, res) => {
    const { deviceId, fullName, mobile } = req.body;
    if (!deviceId || !fullName?.trim() || !mobile?.trim())
        return res.status(400).json({ success: false, error: 'deviceId,fullName,mobile required' });

    const updated = await User.findOneAndUpdate(
        { deviceId },
        { $set: { fullName: fullName.trim(), mobile: mobile.trim(), orderConfirmed: true, lastSeen: new Date() } },
        { new: true, runValidators: true }
    );
    if (!updated)
        return res.status(404).json({ success: false, error: `No user ${deviceId}` });

    return res.json({
        success: true,
        user: {
            deviceId, fullName: updated.fullName,
            mobile: updated.mobile, orderConfirmed: updated.orderConfirmed
        }
    });
};