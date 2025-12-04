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

// DOM layout optimization and scaling
export const domLayoutState = {
    pendingItemPositions: [],
    pageZoomLevel: 1.0, // Browser zoom factor (1.0 = 100%, 1.5 = 150%, etc.)
    lastWindowWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    lastWindowHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    deviceProfile: {
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        screenWidth: typeof window !== 'undefined' && window.screen ? window.screen.width : 0,
        screenHeight: typeof window !== 'undefined' && window.screen ? window.screen.height : 0,
        pixelRatio: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
        isTouch: typeof window !== 'undefined' ? ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0)) : false,
        isMobileViewport: typeof window !== 'undefined' ? (Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 920) : false,
        signature: '',
    },
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

// Point aggregation configuration and state
export const aggregationState = {
    enabled: true, // ENABLED: show aggregated cards but display all harvest points on map
    distanceThreshold: 8, // Units: only aggregate points within 8 units
    aggregatedPoints: {}, // Maps aggregated key to aggregation data
    pointToAggregationKey: {}, // Maps original point to aggregation group key
    debugMode: true, // Enable console logs for debugging
};

// Display mode state
export const displayModeState = {
    mode: 'all', // 'aggregated' or 'all' - whether to show aggregated cards or all cards individually
    // Load from localStorage on initialization
    init() {
        const saved = localStorage.getItem('ursekai-xray-display-mode');
        if (saved === 'aggregated' || saved === 'all') {
            this.mode = saved;
        } else {
            this.mode = 'all'; // Default to showing all cards
        }
    },
    setMode(newMode) {
        if (newMode === 'aggregated' || newMode === 'all') {
            this.mode = newMode;
            localStorage.setItem('ursekai-xray-display-mode', newMode);
        }
    }
};

// Drag interaction state
export const dragState = {
    isDragging: false,
    draggedCard: null, // The DOM element being dragged
    dragStartX: 0,
    dragStartY: 0,
    dragOffsetX: 0,
    dragOffsetY: 0,
    originalPosition: null, // Store original transform for reset
    harvestPoints: [], // Harvest points associated with dragged card
    aggregatedIndices: [], // Original point indices if card is aggregated
    isAggregatedCard: false,
    hiddenOriginalPointIndices: [], // Original point indices to hide during drag (from aggregatedIndices)
    hasTriggeredRerender: false, // Flag to trigger hide aggregated points on first move
    connectionLineCanvas: null, // Canvas for drawing connection lines
    fixtureId: 0, // Fixture ID for connection line color matching
    activePointerId: null, // Track pointer id so touch/mouse do not conflict
};
