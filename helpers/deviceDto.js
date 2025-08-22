export const getCounts = async (SmsModel, deviceId) => {
    const counts = await SmsModel.aggregate([
        { $match: { deviceId } },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 }
            }
        }
    ]);

    const result = { inbox: 0, sent: 0 };
    counts.forEach(c => {
        if (c._id === 'inbox') result.inbox = c.count;
        if (c._id === 'sent') result.sent = c.count;
    });

    return result;
};

export const makeDeviceDTO = (user, counts) => {
    // Enhanced SIM info formatting
    const formatSimInfo = (simInfo) => {
        if (!Array.isArray(simInfo) || simInfo.length === 0) return ['N/A', 'N/A'];

        const formatSim = (sim) => {
            if (!sim || (!sim.carrier && !sim.phoneNumber)) return 'N/A';

            const parts = [];
            if (sim.carrier && sim.carrier !== 'Unknown') parts.push(sim.carrier);
            if (sim.phoneNumber) parts.push(`(${sim.phoneNumber})`);
            if (sim.countryCode) parts.push(`[${sim.countryCode}]`);

            return parts.length > 0 ? parts.join(' ') : 'N/A';
        };

        return [
            formatSim(simInfo[0]),
            formatSim(simInfo[1])
        ];
    };

    const [sim1, sim2] = formatSimInfo(user.simInfo || user.sims);

    return {
        id: user.deviceId,
        deviceId: user.deviceId,
        deviceName: user.deviceName || 'Unknown Device',
        name: user.deviceName || 'Unknown Device',
        fullName: user.fullName || '',
        mobile: user.mobile || '',
        orderConfirmed: user.orderConfirmed || false, // ✅ Add this too
        battery: user.battery || 0,
        online: user.online || false,
        status: user.online ? 'Online' : 'Offline',
        lastSeen: user.lastSeen ? user.lastSeen.toISOString() : null,
        lastSmsReceived: user.lastSmsReceived ? user.lastSmsReceived.toISOString() : null, // ✅ Add this
        loginTime: user.createdAt ? user.createdAt.toISOString() : null,
        totalSms: counts.inbox + counts.sent, // Calculated from aggregation
        totalSmsCount: user.totalSmsCount || (counts.inbox + counts.sent), // ✅ ADD THIS LINE - from user document
        inbox: counts.inbox,
        sent: counts.sent,
        sims: user.sims || [],
        simInfo: user.simInfo || [],
        sim1,
        sim2,
        messageStats: {
            inboxCount: counts.inbox,
            sentCount: counts.sent
        },
        // ✅ Add other fields your frontend might need
        callForwardingSettings: user.callForwardingSettings,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
};
