/**
 * Data Parser Module
 * Handles all data parsing and format detection
 */

import { SITE_ID_MAP } from './config.js';
import { sceneState } from './state.js';

// Logger function - defined locally to avoid circular imports
function logger(message) {
    const logContainer = document.getElementById('logContainer');
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
 * Detect and determine JSON format type
 */
export function detectDataFormat(gameData) {
    // Check for standard format (API response)
    if (gameData && typeof gameData === 'object' && gameData.updatedResources) {
        return 'standard';
    }

    // Check for simplified format (site names as keys)
    if (gameData && typeof gameData === 'object') {
        for (const key in gameData) {
            if (key.startsWith('Site:')) {
                return 'simplified';
            }
        }
    }

    return 'unknown';
}

/**
 * Parse simplified JSON format (Site: name + fixtures array)
 */
export function parseMapDataSimplified(gameData) {
    if (!gameData || typeof gameData !== 'object') {
        logger('Error: Invalid data format');
        return {};
    }

    const processedMap = {};
    let totalScenes = 0;

    // Map site names to scene keys
    const siteNameToScene = {
        'Site: 初始空地': 'さいしょの原っぱ',
        'Site: 心愿沙滩': '願いの砂浜',
        'Site: 烂漫花田': '彩りの花畑',
        'Site: 忘却之所': '忘れ去られた場所'
    };

    // Process each site
    for (const siteName in gameData) {
        if (!gameData.hasOwnProperty(siteName)) continue;

        // Get the corresponding scene name
        const sceneName = siteNameToScene[siteName];
        if (!sceneName) {
            logger(`Warning: Unknown site format "${siteName}"`);
            continue;
        }

        const fixtures = gameData[siteName];

        // Verify it's an array
        if (!Array.isArray(fixtures)) {
            logger(`Warning: Site data for "${siteName}" is not an array`);
            continue;
        }

        const mpDetail = [];

        // Process each fixture in the array
        fixtures.forEach(fixture => {
            if (!fixture.location || !fixture.fixtureId) {
                return; // Skip invalid fixtures
            }

            const point = {
                location: fixture.location,
                fixtureId: fixture.fixtureId,
                reward: fixture.reward || {}
            };

            mpDetail.push(point);
        });

        processedMap[sceneName] = mpDetail;
        logger(`Scene "${sceneName}" loaded: ${mpDetail.length} fixtures`);
        totalScenes++;
    }

    if (totalScenes === 0) {
        logger('Warning: No valid scenes found in simplified format');
    } else {
        logger(`Found ${totalScenes} scenes in simplified format`);
    }

    return processedMap;
}

/**
 * Parse harvest map data from game API response (standard format)
 */
export function parseMapDataStandard(gameData) {
    if (!gameData) {
        logger('Error: gameData is null');
        return {};
    }

    if (!gameData.updatedResources) {
        logger('Warning: updatedResources not found');
        return {};
    }

    if (!gameData.updatedResources.userMysekaiHarvestMaps) {
        logger('Warning: userMysekaiHarvestMaps not found');
        return {};
    }

    const harvestMaps = gameData.updatedResources.userMysekaiHarvestMaps;
    logger(`Found ${harvestMaps.length} scenes`);

    const processedMap = {};

    harvestMaps.forEach((mp) => {
        const siteId = mp.mysekaiSiteId;
        const siteName = SITE_ID_MAP[siteId] || `Unknown Site ${siteId}`;

        const mpDetail = [];
        const fixtures = mp.userMysekaiSiteHarvestFixtures || [];
        const drops = mp.userMysekaiSiteHarvestResourceDrops || [];

        // Collect all spawned fixtures
        let spawnedCount = 0;
        fixtures.forEach(fixture => {
            if (fixture.userMysekaiSiteHarvestFixtureStatus === "spawned") {
                mpDetail.push({
                    location: [fixture.positionX, fixture.positionZ],
                    fixtureId: fixture.mysekaiSiteHarvestFixtureId,
                    reward: {}
                });
                spawnedCount++;
            }
        });

        // Add drop items to fixtures
        drops.forEach(drop => {
            const pos = [drop.positionX, drop.positionZ];
            const found = mpDetail.find(item =>
                item.location[0] === pos[0] && item.location[1] === pos[1]
            );

            if (found) {
                if (!found.reward[drop.resourceType]) {
                    found.reward[drop.resourceType] = {};
                }
                found.reward[drop.resourceType][drop.resourceId] =
                    (found.reward[drop.resourceType][drop.resourceId] || 0) + drop.quantity;
            }
        });

        processedMap[siteName] = mpDetail;
        logger(`Scene "${siteName}" loaded: ${spawnedCount} fixtures`);
    });

    return processedMap;
}

/**
 * Parse harvest map data - auto-detects format and processes accordingly
 */
export function parseMapData(gameData) {
    const format = detectDataFormat(gameData);

    if (format === 'standard') {
        logger('Detected standard format (API response)');
        return parseMapDataStandard(gameData);
    } else if (format === 'simplified') {
        logger('Detected simplified format (site-indexed)');
        return parseMapDataSimplified(gameData);
    } else {
        logger('Error: Unable to detect data format');
        return {};
    }
}

/**
 * Load data from local mysekai_data.json file
 */
export async function loadLocalData() {
    logger('Loading mysekai_data.json...');
    try {
        const response = await fetch('mysekai_data.json');

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }

        const gameData = await response.json();

        sceneState.harvestData = parseMapData(gameData);
        sceneState.lastUpdateTime = Date.now() / 1000;

        const sceneNames = Object.keys(sceneState.harvestData);
        if (sceneNames.length === 0) {
            logger('Warning: No scene data loaded');
        } else {
            logger('Data loaded: ' + sceneNames.join(', '));
        }

        // Update button states
        updateSceneButtonStatus();

        // Auto-mark points on current scene
        parseAndMarkPoints();
    } catch (error) {
        logger('Error loading data: ' + error.message);
    }
}

/**
 * Parse custom mixed format (Site name + JSON array lines)
 */
export function parseCustomFormat(content) {
    const lines = content.split('\n');
    const result = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Check if this line starts with "Site:"
        if (line.startsWith('Site:')) {
            // The next line should be the JSON array
            if (i + 1 < lines.length) {
                const siteNameLine = line;
                const jsonLine = lines[i + 1].trim();

                try {
                    const fixtures = JSON.parse(jsonLine);
                    if (Array.isArray(fixtures)) {
                        result[siteNameLine] = fixtures;
                    }
                } catch (e) {
                    // Skip lines that can't be parsed as JSON
                }
            }
        }
    }

    return Object.keys(result).length > 0 ? result : null;
}

/**
 * Process JSON file content - returns result, ui.js handles actions
 */
export function processJsonFile(content, fileName) {
    let gameData = null;
    let parseMethod = 'unknown';

    // Method 1: Try standard JSON format
    try {
        gameData = JSON.parse(content);
        parseMethod = 'standard JSON';
    } catch (error) {
        // Method 2: Try custom mixed format (Site: name + JSON array)
        gameData = parseCustomFormat(content);
        if (gameData) {
            parseMethod = 'custom mixed format';
        }
    }

    // If we got data from either method, try to process it
    if (gameData) {
        try {
            const parsedData = parseMapData(gameData);
            const sceneNames = Object.keys(parsedData);

            if (sceneNames.length === 0) {
                logger('Warning: No valid scenes found in data');
                return { success: false, error: 'No valid scene data found in file', fileName };
            }

            logger(`Successfully parsed with ${parseMethod}`);
            logger('Data loaded: ' + sceneNames.join(', '));

            return {
                success: true,
                data: parsedData,
                parseMethod,
                fileName,
                sceneNames
            };
        } catch (error) {
            logger('Error processing extracted data: ' + error.message);
            return { success: false, error: 'Error processing data: ' + error.message, fileName };
        }
    } else {
        logger('Error: Could not parse file with any supported format');
        return {
            success: false,
            error: 'File format not supported. Please use standard JSON or Site: format',
            fileName
        };
    }
}

/**
 * Handle file upload - returns a promise with result
 */
export function handleFileUpload(file, onSuccess, onError) {
    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const content = e.target.result;
            const result = processJsonFile(content, file.name);

            if (result.success) {
                logger(`Data loaded from file: ${file.name}`);
                if (onSuccess) onSuccess(result);
            } else {
                if (onError) onError(result);
            }

            resolve(result);
        };

        reader.onerror = () => {
            logger('Error reading file');
            const error = { success: false, error: 'Failed to read file', fileName: file.name };
            if (onError) onError(error);
            resolve(error);
        };

        reader.readAsText(file);
    });
}
