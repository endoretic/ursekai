/**
 * UI Module
 * Handles all UI interactions and rendering orchestration
 */

import { SCENES, FIXTURE_COLORS, ITEM_TEXTURES, RARE_ITEM, SUPER_RARE_ITEM, SITE_ID_MAP } from './config.js';
import { canvasState, sceneState, domElements, canvasOptimizationState, filterState, texturePreloadState } from './state.js';
import { initCanvas, drawGrid, markPoint, displayReward, processPendingItemPositions, adjustItemListPositions, clearItemLists, clearDirtyRegions, calculateDirtyRegions, clearGrid, aggregatePoints } from './canvas.js';
import { changeFilterMode, toggleFilterPanel, doContainsRareItem, shouldShowItem, setFilterChangeCallback } from './filters.js';
import { handleFileUpload, processJsonFile } from './dataParser.js';

/**
 * Log messages to UI
 */
export function logger(message) {
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
 * Parse and mark all points on canvas
 */
export function parseAndMarkPoints() {
    try {
        // Scene name mapping
        const sceneNameMap = {
            'scene1': 'さいしょの原っぱ',
            'scene2': '彩りの花畑',
            'scene3': '願いの砂浜',
            'scene4': '忘れ去られた場所'
        };

        const sceneName = sceneNameMap[sceneState.currentScene];
        const points = sceneState.harvestData[sceneName];

        // Use dirty region detection if enabled
        const usePartialRedraw = canvasOptimizationState.isDirtyCanvasEnabled && canvasOptimizationState.lastRenderedPoints.length > 0 && calculateDirtyRegions(points);

        if (usePartialRedraw) {
            clearDirtyRegions();
        } else {
            // Full canvas clear for first render or significant changes
            initCanvas();
        }

        clearItemLists();

        if (!points) {
            logger(`Scene ${sceneName} has no data`);
            return;
        }

        if (!Array.isArray(points)) {
            logger("Error: Data is not an array");
            return;
        }

        // Aggregate similar nearby points
        const aggregatedPoints = aggregatePoints(points);

        // Batch DOM insertions using DocumentFragment
        const fragment = document.createDocumentFragment();
        if (!canvasState.reverseXY) {
            aggregatedPoints.forEach(point => markPoint(point, fragment));
        } else {
            aggregatedPoints.forEach(point => markPoint({location: [point.location[1], point.location[0]], fixtureId: point.fixtureId, reward: point.reward, isAggregated: point.isAggregated, aggregatedCount: point.aggregatedCount}, fragment));
        }
        document.querySelector('.image-container').appendChild(fragment);

        // Process positions after DOM rendering
        requestAnimationFrame(() => {
            processPendingItemPositions();
            if (aggregatedPoints.length < 300) {
                adjustItemListPositions(5, 5);
            }
        });

        const aggregatedCount = aggregatedPoints.filter(p => p.isAggregated).length;
        logger(`Marked ${points.length} fixtures (${aggregatedCount} aggregated into ${points.length - aggregatedCount} groups)`);

        // Update item summary
        updateItemSummary();

        // Save current points for dirty region detection in next render
        canvasOptimizationState.lastRenderedPoints = points.map(p => ({ location: [...p.location] }));
    } catch (error) {
        logger("Error marking points: " + error.message);
    }
}

/**
 * Update scene buttons with super rare item indicator
 */
export function updateSceneButtonStatus() {
    const sceneNameMap = {
        'scene1': 'さいしょの原っぱ',
        'scene2': '彩りの花畑',
        'scene3': '願いの砂浜',
        'scene4': '忘れ去られた場所'
    };

    for (const sceneKey in sceneNameMap) {
        const sceneName = sceneNameMap[sceneKey];
        const points = sceneState.harvestData[sceneName];
        const button = document.querySelector(`button[data-scene="${sceneKey}"]`);

        if (!button) continue;

        // Remove previous super-rare styling
        button.classList.remove('super-rare');

        if (points && Array.isArray(points)) {
            // Check if scene has super rare items
            const hasSuperRare = points.some(point => {
                return doContainsRareItem(point.reward, true);
            });

            if (hasSuperRare) {
                button.classList.add('super-rare');
                logger(`Scene ${sceneName} has super rare items!`);
            }
        }
    }
}

/**
 * Select and display a scene
 */
export function selectScene(sceneKey) {
    sceneState.currentScene = sceneKey;
    const selectedScene = SCENES[sceneKey];

    if (selectedScene) {
        // Update button state
        document.querySelectorAll('.scene-buttons button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`button[data-scene="${sceneKey}"]`).classList.add('active');

        domElements.physicalWidthInput.value = selectedScene.physicalWidth;
        domElements.offsetXInput.value = selectedScene.offsetX;
        domElements.offsetYInput.value = selectedScene.offsetY;
        canvasState.xDirection = selectedScene.xDirection;
        canvasState.yDirection = selectedScene.yDirection;
        canvasState.reverseXY = selectedScene.reverseXY;

        logger(`Scene changed: ${sceneKey}`);

        // Set image path and wait for loading to complete
        domElements.image.src = selectedScene.imagePath;

        // Wait for image loading before initializing canvas and drawing
        // Use requestAnimationFrame to ensure DOM layout is stable
        // This prevents race conditions when sidebar is closed during scene change
        const initializeCanvasAfterLoad = () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    initCanvas();
                    parseAndMarkPoints();

                    // Preload textures for current scene (priority loading)
                    preloadSceneTextures(sceneKey);
                });
            });
        };

        if (domElements.image.complete) {
            initializeCanvasAfterLoad();
        } else {
            domElements.image.onload = initializeCanvasAfterLoad;
        }
    } else {
        logger(`Scene not found: ${sceneKey}`);
    }
}

/**
 * Set coordinate direction
 */
export function setDirection(newXDirection, newYDirection) {
    canvasState.xDirection = newXDirection;
    canvasState.yDirection = newYDirection;
    parseAndMarkPoints();
}

/**
 * Create item preview element
 */
function createItemPreview() {
    if (!domElements.itemPreview) {
        domElements.itemPreview = document.createElement('div');
        domElements.itemPreview.className = 'item-preview';
        document.body.appendChild(domElements.itemPreview);
    }
    return domElements.itemPreview;
}

/**
 * Show item preview tooltip
 */
export function showItemPreview(imgSrc, itemName, mouseX, mouseY) {
    const preview = createItemPreview();
    preview.innerHTML = `<img src="${imgSrc}" onerror="this.style.display='none'">`;
    preview.classList.add('active');
    preview.style.left = (mouseX + 15) + 'px';
    preview.style.top = (mouseY + 15) + 'px';
}

/**
 * Hide item preview tooltip
 */
export function hideItemPreview() {
    if (domElements.itemPreview) {
        domElements.itemPreview.classList.remove('active');
    }
}

/**
 * Toggle sidebar visibility
 */
export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuToggle = document.querySelector('.menu-toggle');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
    menuToggle.style.display = sidebar.classList.contains('active') ? 'none' : 'flex';
}

/**
 * Close sidebar
 */
export function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuToggle = document.querySelector('.menu-toggle');
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    menuToggle.style.display = 'flex';
}

/**
 * Initialize sidebar
 */
export function initializeSidebar() {
    const sidebarContent = document.getElementById('sidebarContent');
    const controlsDiv = document.querySelector('.controls');

    if (sidebarContent.innerHTML.trim() === '') {
        sidebarContent.innerHTML = controlsDiv.innerHTML;
    }
}

/**
 * Open drop zone modal
 */
export function openDropZoneModal() {
    const backdrop = document.getElementById('dropZoneBackdrop');
    backdrop.classList.remove('hidden');
}

/**
 * Close drop zone modal
 */
export function closeDropZoneModal() {
    const backdrop = document.getElementById('dropZoneBackdrop');
    backdrop.classList.add('hidden');
}

/**
 * Show data loaded success indicator
 */
export function showDataLoadedIndicator(fileName) {
    const indicator = document.createElement('div');
    indicator.className = 'data-loaded-indicator';
    indicator.textContent = `✓ Loaded: ${fileName}`;
    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 3000);
}

/**
 * Show data load error indicator
 */
export function showDataErrorIndicator(message) {
    const indicator = document.createElement('div');
    indicator.className = 'data-error-indicator';
    indicator.textContent = `✗ Error: ${message}`;
    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 4000);
}

/**
 * Callback for successful data loading
 */
function onDataLoaded(result) {
    // Update state with loaded data
    sceneState.harvestData = result.data;
    sceneState.lastUpdateTime = Date.now() / 1000;
    sceneState.dataLoadedFromFile = true;

    // Update UI
    updateSceneButtonStatus();
    parseAndMarkPoints();
    closeDropZoneModal();
    showDataLoadedIndicator(result.fileName);

    // Start background preload of all textures after data is loaded
    preloadAllTexturesInBackground();
}

/**
 * Callback for data loading error
 */
function onDataError(result) {
    showDataErrorIndicator(result.error);
}

/**
 * Initialize drop zone with drag/drop support
 */
export function initializeDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('hiddenFileInput');
    const backdrop = document.getElementById('dropZoneBackdrop');

    // Drag and drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0], onDataLoaded, onDataError);
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0], onDataLoaded, onDataError);
        }
    });

    // Close modal when clicking outside
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
            closeDropZoneModal();
        }
    });

    // Prevent default drag behavior on body
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
    });
}

/**
 * Initialize delegated event listeners for item preview tooltips
 */
export function initializeImagePreviewDelegation() {
    const imageContainer = document.querySelector('.image-container');

    // Single delegated listener for mouseover events
    imageContainer.addEventListener('mouseover', (e) => {
        if (e.target.tagName === 'IMG' && e.target.dataset.category) {
            const category = e.target.dataset.category;
            const itemId = e.target.dataset.itemId;
            showItemPreview(e.target.src, `${category} #${itemId}`, e.clientX, e.clientY);
        }
    });

    // Single delegated listener for mousemove events
    imageContainer.addEventListener('mousemove', (e) => {
        if (e.target.tagName === 'IMG' && e.target.dataset.category) {
            const preview = domElements.itemPreview;
            if (preview && preview.classList.contains('active')) {
                preview.style.left = (e.clientX + 15) + 'px';
                preview.style.top = (e.clientY + 15) + 'px';
            }
        }
    });

    // Single delegated listener for mouseout events
    imageContainer.addEventListener('mouseout', (e) => {
        if (e.target.tagName === 'IMG' && e.target.dataset.category) {
            hideItemPreview();
        }
    });
}

// ============================================
// 🎨 Texture Preloading System
// ============================================

/**
 * Collect all texture paths for a specific scene
 */
export function getSceneTextures(sceneKey) {
    const sceneNameMap = {
        'scene1': 'さいしょの原っぱ',
        'scene2': '彩りの花畑',
        'scene3': '願いの砂浜',
        'scene4': '忘れ去られた場所'
    };

    const sceneName = sceneNameMap[sceneKey];
    const points = sceneState.harvestData[sceneName] || [];
    const textures = new Set();

    // Collect textures from all fixtures in this scene
    points.forEach(point => {
        for (const category in point.reward) {
            if (!point.reward.hasOwnProperty(category)) continue;
            for (const itemId in point.reward[category]) {
                if (!point.reward[category].hasOwnProperty(itemId)) continue;

                const texture = ITEM_TEXTURES[category]?.[itemId];
                if (texture) {
                    textures.add(texture);
                }
            }
        }
    });

    return Array.from(textures);
}

/**
 * Preload a batch of textures
 */
async function preloadTexturesBatch(texturePaths) {
    if (texturePaths.length === 0) return;

    return Promise.all(
        texturePaths.map(texturePath => {
            return new Promise((resolve) => {
                // Check if already loaded
                if (texturePreloadState.allTexturesLoaded.has(texturePath)) {
                    resolve();
                    return;
                }

                const img = new Image();
                img.onload = () => {
                    texturePreloadState.allTexturesLoaded.add(texturePath);
                    resolve();
                };
                img.onerror = () => {
                    // Still mark as attempted, but don't block
                    texturePreloadState.allTexturesLoaded.add(texturePath);
                    logger(`⚠️ Failed to preload: ${texturePath}`);
                    resolve();
                };
                img.src = texturePath;
            });
        })
    );
}

/**
 * Preload textures for a specific scene (with priority)
 */
export async function preloadSceneTextures(sceneKey) {
    if (!sceneState.harvestData || Object.keys(sceneState.harvestData).length === 0) {
        return;
    }

    const sceneNameMap = {
        'scene1': 'Scene 1 (さいしょの原っぱ)',
        'scene2': 'Scene 2 (彩りの花畑)',
        'scene3': 'Scene 3 (願いの砂浜)',
        'scene4': 'Scene 4 (忘れ去られた場所)'
    };

    const textures = getSceneTextures(sceneKey);
    const remaining = textures.filter(t => !texturePreloadState.allTexturesLoaded.has(t));

    if (remaining.length > 0) {
        logger(`🔄 Preloading ${remaining.length} textures for ${sceneNameMap[sceneKey]}...`);
        await preloadTexturesBatch(remaining);
        texturePreloadState.sceneTexturesLoaded[sceneKey] = true;
        logger(`✅ ${sceneNameMap[sceneKey]} textures ready`);
    }
}

/**
 * Preload all textures in background (called after data is loaded)
 */
export async function preloadAllTexturesInBackground() {
    if (!sceneState.harvestData || Object.keys(sceneState.harvestData).length === 0) {
        return;
    }

    if (texturePreloadState.isPreloading) {
        return; // Already preloading
    }

    texturePreloadState.isPreloading = true;
    texturePreloadState.preloadStartTime = Date.now();

    // Get all unique textures across all scenes
    const allTextures = new Set();
    for (const category in ITEM_TEXTURES) {
        for (const itemId in ITEM_TEXTURES[category]) {
            const texture = ITEM_TEXTURES[category][itemId];
            allTextures.add(texture);
        }
    }

    const textureList = Array.from(allTextures);

    // Preload in batches with delays to avoid blocking UI
    const batchSize = 15;

    for (let i = 0; i < textureList.length; i += batchSize) {
        const batch = textureList.slice(i, i + batchSize);
        await preloadTexturesBatch(batch);

        // Small delay between batches to avoid blocking UI
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    logger(`✨ Background textures ready`);
    texturePreloadState.isPreloading = false;
}

/**
 * Calculate and display item summary for current scene
 */
export function updateItemSummary() {
    const sceneNameMap = {
        'scene1': 'さいしょの原っぱ',
        'scene2': '彩りの花畑',
        'scene3': '願いの砂浜',
        'scene4': '忘れ去られた場所'
    };

    const sceneName = sceneNameMap[sceneState.currentScene];
    const points = sceneState.harvestData[sceneName];
    const summaryContainer = document.getElementById('itemSummary');

    if (!points || !Array.isArray(points) || points.length === 0) {
        summaryContainer.innerHTML = '<div class="item-summary-empty">No items in this scene</div>';
        return;
    }

    // Aggregate items with their quantities
    const itemMap = {}; // { "category_itemId": { texture, quantity, category, itemId } }

    points.forEach(point => {
        for (const category in point.reward) {
            if (!point.reward.hasOwnProperty(category)) continue;
            for (const itemId in point.reward[category]) {
                if (!point.reward[category].hasOwnProperty(itemId)) continue;

                // Check if this item should be displayed
                if (!shouldShowItem(category, itemId)) {
                    continue;
                }

                const key = `${category}_${itemId}`;
                const quantity = point.reward[category][itemId];

                if (!itemMap[key]) {
                    let texture = ITEM_TEXTURES[category]?.[itemId] || './icon/missing.png';
                    if (category === "mysekai_music_record") {
                        texture = './icon/Texture2D/item_surplus_music_record.png';
                    }

                    itemMap[key] = {
                        texture: texture,
                        quantity: 0,
                        category: category,
                        itemId: itemId
                    };
                }

                itemMap[key].quantity += quantity;
            }
        }
    });

    // Render item summary
    if (Object.keys(itemMap).length === 0) {
        summaryContainer.innerHTML = '<div class="item-summary-empty">No items to display based on current filter</div>';
        return;
    }

    let html = '<h3>📊 Scene Items Summary</h3><div class="item-summary-content">';

    // Sort items by category for better organization
    const sortedItems = Object.values(itemMap).sort((a, b) => {
        if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
        }
        return a.itemId - b.itemId;
    });

    sortedItems.forEach(item => {
        html += `
            <div class="item-summary-item" title="${item.category} #${item.itemId}">
                <img src="${item.texture}" alt="${item.category} #${item.itemId}">
                <span class="item-summary-quantity">×${item.quantity}</span>
            </div>
        `;
    });

    html += '</div>';
    summaryContainer.innerHTML = html;
}

/**
 * Initialize all UI on page load
 */
export function initializeUI() {
    // Initialize DOM element references
    domElements.image = document.getElementById('image');
    domElements.canvas = document.getElementById('gridCanvas');
    domElements.physicalWidthInput = document.getElementById('physicalWidth');
    domElements.offsetXInput = document.getElementById('offsetX');
    domElements.offsetYInput = document.getElementById('offsetY');
    domElements.ctx = domElements.canvas.getContext('2d');

    // Set up callback for filter changes
    setFilterChangeCallback(parseAndMarkPoints);

    logger('Page loaded. Please load a data file to continue.');
    initializeSidebar();
    initializeDropZone();
    initializeImagePreviewDelegation();

    // Initialize first scene (this will load image and set up canvas)
    selectScene('scene1');

    // Show upload modal on page load
    openDropZoneModal();
}

// Window resize handler
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    // Delay increased to 400ms to avoid conflicts with sidebar CSS animations (0.3s)
    resizeTimeout = setTimeout(() => {
        initCanvas();
        parseAndMarkPoints();
    }, 400);
});

// Initialize on page load
window.addEventListener('load', initializeUI);

// Export functions to window for HTML onclick handlers and global access
window.logger = logger;
window.selectScene = selectScene;
window.setDirection = setDirection;
window.drawGrid = drawGrid;
window.clearGrid = clearGrid;
window.toggleFilterPanel = toggleFilterPanel;
window.changeFilterMode = changeFilterMode;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.openDropZoneModal = openDropZoneModal;
window.closeDropZoneModal = closeDropZoneModal;

// Note: initializeUI, changeFilterMode, and toggleFilterPanel are already exported
// as named exports via 'export function' declarations above
