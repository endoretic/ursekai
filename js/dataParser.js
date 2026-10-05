/**
 * Data Parser Module
 * Parses compact MySekai API JSON
 */

import { SITE_ID_MAP } from './config.js';

const FORMAT_ERROR = 'Only compact MySekai API JSON is supported.';

function requireArray(value, minLength = 0) {
    if (!Array.isArray(value) || value.length < minLength) throw new Error(FORMAT_ERROR);
    return value;
}

// Logger function - defined locally to avoid circular imports
function logger(message) {
    if (typeof document === 'undefined') return;
    const logContainer = document.getElementById('logContainer');
    if (!logContainer) return;
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';

    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    const now = new Date();
    timestamp.textContent = `[${now.toLocaleString()}]`;

    const messageSpan = document.createElement('span');
    messageSpan.className = 'message';
    messageSpan.textContent = message;

    logEntry.appendChild(timestamp);
    logEntry.appendChild(messageSpan);
    logContainer.appendChild(logEntry);

    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * Read compact rows directly; trailing optional fields are not needed for the overlay.
 */
export function parseMapData(gameData) {
    const maps = requireArray(gameData?.updatedResources?.userMysekaiHarvestMaps);
    const result = {};
    for (const map of maps) {
        const [siteId, fixtures, drops] = requireArray(map, 3);
        if (!Number.isInteger(siteId)) throw new Error(FORMAT_ERROR);
        const points = [];
        for (const row of requireArray(fixtures)) {
            const [fixtureId, x, z, , status] = requireArray(row, 5);
            if (!Number.isInteger(fixtureId) || ![x, z].every(Number.isFinite) || typeof status !== 'string') {
                throw new Error(FORMAT_ERROR);
            }
            if (status === 'spawned') points.push({ location: [x, z], fixtureId, reward: {} });
        }
        for (const row of requireArray(drops)) {
            // Drop columns 4-6 are HP, sequence and status; quantity is column 7.
            const [category, itemId, x, z, , , , quantity] = requireArray(row, 8);
            if (typeof category !== 'string' || !/^[a-z]+(?:_[a-z]+)*$/.test(category) ||
                !Number.isInteger(itemId) || ![x, z].every(Number.isFinite) ||
                !Number.isInteger(quantity) || quantity < 0) throw new Error(FORMAT_ERROR);
            // ponytail: linear lookup suits small maps; index positions if maps grow.
            const point = points.find(item => item.location[0] === x && item.location[1] === z);
            if (!point) continue;
            if (!Object.hasOwn(point.reward, category)) point.reward[category] = {};
            point.reward[category][itemId] = (point.reward[category][itemId] || 0) + quantity;
        }
        const siteName = SITE_ID_MAP[siteId] || `Unknown Site ${siteId}`;
        result[siteName] = points;
        logger(`Scene "${siteName}" loaded: ${points.length} fixtures`);
    }
    return result;
}

/**
 * Process a decrypted API response; ui.js handles success and error presentation.
 */
export function processJsonFile(content, fileName) {
    try {
        const data = parseMapData(JSON.parse(content));
        const sceneNames = Object.keys(data);
        if (sceneNames.length === 0) throw new Error('No scene data found in file');
        logger('Data loaded: ' + sceneNames.join(', '));
        return { success: true, data, parseMethod: 'compact JSON', fileName, sceneNames };
    } catch (error) {
        logger('Error loading data: ' + error.message);
        return { success: false, error: error.message, fileName };
    }
}

/**
 * Handle file upload - returns a promise with result
 */
export async function handleFileUpload(file, onSuccess, onError) {
    let result;
    try {
        result = processJsonFile(await file.text(), file.name);
    } catch (error) {
        result = { success: false, error: 'Failed to read file', fileName: file.name };
    }
    if (result.success) {
        logger(`Data loaded from file: ${file.name}`);
        onSuccess?.(result);
    } else {
        onError?.(result);
    }
    return result;
}
