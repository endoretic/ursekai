/**
 * Shared State Management
 * Centralized state for all modules
 */

// Canvas configuration
export const canvasState = {
    xDirection: 'x+',
    yDirection: 'y-',
    reverseXY: false,
};

// Scene and data management
export const sceneState = {
    currentScene: 'scene1',
    harvestData: {},
    lastUpdateTime: 0,
    dataLoadedFromFile: false,
};

// Filter state
export const filterState = {
    filterMode: 'all', // 'all', 'rare', 'custom'
    selectedItems: new Set(),
    filterDebounceTimer: null,
};

const FILTER_DEBOUNCE_DELAY = 150;
export { FILTER_DEBOUNCE_DELAY };

// UI element references
export const domElements = {
    image: null,
    canvas: null,
    physicalWidthInput: null,
    offsetXInput: null,
    offsetYInput: null,
    ctx: null,
    itemPreview: null,
};

// DOM layout optimization
export const domLayoutState = {
    pendingItemPositions: [],
};

// Canvas optimization
export const canvasOptimizationState = {
    lastRenderedPoints: [],
    dirtyRegions: [],
    isDirtyCanvasEnabled: true,
};

// Texture preloading state
export const texturePreloadState = {
    allTexturesLoaded: new Set(),
    sceneTexturesLoaded: {},
    isPreloading: false,
    preloadStartTime: null,
};
