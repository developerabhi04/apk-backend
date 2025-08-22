export const normalizeDeviceId = (deviceId) => {
    if (!deviceId || typeof deviceId !== 'string') return null;

    const trimmed = deviceId.trim();
    if (!trimmed || trimmed === 'unknown' || trimmed === 'unknown_device' || trimmed.length < 6) {
        return null;
    }

    return trimmed;
};
