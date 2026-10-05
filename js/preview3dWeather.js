// Names/IDs follow mysekaiPhenomenas. JP lighting/textures are resolved by the atmosphere renderer.
const PHENOMENA = {
    1: ['Sunny', 'sunny'], 2: ['Evening', 'evening'], 3: ['Night', 'night'],
    4: ['Fine', 'sunny'], 5: ['Full moon', 'night'], 6: ['Rain', 'rain'],
    7: ['Rainy night', 'night'], 8: ['Thunder', 'night'], 9: ['Meteor shower', 'night'],
    10: ['Snow', 'rain'], 11: ['Snowy night', 'night'], 12: ['Soap bubbles', 'sunny'],
    13: ['Universe', 'night'], 14: ['Sekai', 'sunny'], 15: ['Cloud', 'sunny'],
    16: ['Underwater', 'sunny'], 17: ['Rainbow', 'sunny']
};
const HALF_DAY = 12 * 60 * 60 * 1000;

export function readCaptureWeather(data) {
    const resources = data?.updatedResources;
    // Use the map's refresh time, never the viewing device's current clock.
    const capturedAt = resources?.userMysekaiGamedata?.refreshedAt ?? resources?.now;
    if (!Number.isFinite(capturedAt) || !Array.isArray(data?.mysekaiPhenomenaSchedules)) return null;
    const schedule = data.mysekaiPhenomenaSchedules.find(row => {
        if (!Number.isFinite(row?.scheduleDate) || ![1, 2].includes(row.mysekaiRefreshTimePeriodId)) return false;
        // scheduleDate anchors the server's game day. Periods are 05–17 and 17–29 (12 hours each).
        const start = row.scheduleDate + (row.mysekaiRefreshTimePeriodId - 1) * HALF_DAY;
        return capturedAt >= start && capturedAt < start + HALF_DAY;
    });
    if (!Number.isInteger(schedule?.mysekaiPhenomenaId)) return null;
    const id = schedule.mysekaiPhenomenaId;
    const [name, preset] = PHENOMENA[id] || [`Weather #${id}`, 'sunny'];
    return { id, name, preset, rain: [6, 7, 8].includes(id) };
}
