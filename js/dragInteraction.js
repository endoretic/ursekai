/**
 * Drag Interaction Module
 * Handles card dragging and connection line visualization
 */

import { dragState, domElements, sceneState, canvasState, domLayoutState } from './state.js';
import { FIXTURE_COLORS } from './config.js';
import { hideItemPreview } from './ui.js';
import { getImageScale } from './canvas.js';

let overlayCanvas = null;
let overlayCtx = null;
let currentScene = 'scene1';

/**
 * Initialize drag interaction for all item cards
 */
export function initializeDragInteraction() {
    // Note: rerender callback no longer needed since all harvest points are always displayed

    // Use event delegation on image-container
    const imageContainer = document.querySelector('.image-container');
    if (!imageContainer) return;

    // Create overlay canvas for connection lines
    createOverlayCanvas();

    // Card dragging events (pointer events support touch + mouse)
    const downEvent = window.PointerEvent ? 'pointerdown' : 'mousedown';
    const moveEvent = window.PointerEvent ? 'pointermove' : 'mousemove';
    const upEvent = window.PointerEvent ? 'pointerup' : 'mouseup';

    imageContainer.addEventListener(downEvent, handleCardPointerDown, { passive: false });
    document.addEventListener(moveEvent, handleCardPointerMove, { passive: false });
    document.addEventListener(upEvent, handleCardPointerUp, { passive: false });
    if (window.PointerEvent) {
        document.addEventListener('pointercancel', handleCardPointerUp, { passive: false });
    }

    // Prevent default drag behavior on images and containers
    imageContainer.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
    });
    imageContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        return false;
    });
    imageContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        return false;
    });
    imageContainer.addEventListener('drag', (e) => {
        e.preventDefault();
        return false;
    });

    // Prevent text selection during dragging
    imageContainer.addEventListener('selectstart', (e) => {
        if (dragState.isDragging) {
            e.preventDefault();
        }
    });

    // Global dragstart prevention for images and item-lists (CAPTURE PHASE)
    document.addEventListener('dragstart', (e) => {
        // Prevent dragging of images, items, and any child elements
        const itemList = e.target.closest('.item-list');
        const isImage = e.target.closest('.image-container img') || e.target.tagName === 'IMG';

        if (itemList || isImage) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'none';
            e.dataTransfer.dropEffect = 'none';
            return false;
        }
    }, true);

    // Prevent ALL drag events on items and images
    document.addEventListener('drag', (e) => {
        const itemList = e.target.closest('.item-list');
        const isImage = e.target.closest('.image-container img') || e.target.tagName === 'IMG';

        if (itemList || isImage) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);

    // Prevent dragend
    document.addEventListener('dragend', (e) => {
        const itemList = e.target.closest('.item-list');
        const isImage = e.target.closest('.image-container img') || e.target.tagName === 'IMG';

        if (itemList || isImage) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);
}

/**
 * Create overlay canvas for drawing connection lines
 */
function createOverlayCanvas() {
    const imageContainer = document.querySelector('.image-container');
    if (!imageContainer) return;

    // Remove existing overlay if present
    const existingOverlay = imageContainer.querySelector('.drag-overlay-canvas');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    overlayCanvas = document.createElement('canvas');
    overlayCanvas.className = 'drag-overlay-canvas';

    // Use image-container dimensions (will be updated with actual image size)
    overlayCanvas.width = imageContainer.clientWidth;
    overlayCanvas.height = imageContainer.clientHeight;

    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
    overlayCanvas.style.cursor = 'grabbing';
    overlayCanvas.style.zIndex = '10000';
    overlayCanvas.style.display = 'none';
    overlayCanvas.style.pointerEvents = 'none';

    imageContainer.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext('2d');
}

/**
 * Refresh overlay canvas dimensions (call after image loads)
 */
export function refreshOverlayCanvas() {
    const imageContainer = document.querySelector('.image-container');
    if (overlayCanvas && imageContainer) {
        overlayCanvas.width = imageContainer.clientWidth;
        overlayCanvas.height = imageContainer.clientHeight;
    }
}

/**
 * Normalize pointer/touch coordinates
 */
function getPointerCoordinates(event) {
    if (event && event.touches && event.touches.length > 0) {
        return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    if (event && event.changedTouches && event.changedTouches.length > 0) {
        return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }
    return { x: event.clientX, y: event.clientY };
}

/**
 * Handle pointerdown on item cards
 */
function handleCardPointerDown(e) {
    // Check if click is on an item-list or inside it
    const itemList = e.target.closest('.item-list');
    if (!itemList) return;

    // Prevent all default behaviors
    e.preventDefault();
    e.stopPropagation();

    const coords = getPointerCoordinates(e);

    dragState.isDragging = true;
    dragState.draggedCard = itemList;
    dragState.dragStartX = coords.x;
    dragState.dragStartY = coords.y;
    dragState.activePointerId = typeof e.pointerId === 'number' ? e.pointerId : null;
    if (dragState.activePointerId !== null && itemList.setPointerCapture) {
        try {
            itemList.setPointerCapture(dragState.activePointerId);
        } catch (err) {
            // Ignore if capture cannot be set
        }
    }

    // Store original position
    const transform = itemList.style.transform;
    dragState.originalPosition = transform;

    // Extract current position from transform
    const translateMatch = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
    const currentX = translateMatch ? parseFloat(translateMatch[1]) : 0;
    const currentY = translateMatch ? parseFloat(translateMatch[2]) : 0;
    dragState.dragOffsetX = currentX;
    dragState.dragOffsetY = currentY;

    // Get harvest point info from data attributes
    const harvestX = parseFloat(itemList.dataset.harvestX) || 0;
    const harvestY = parseFloat(itemList.dataset.harvestY) || 0;
    const gameX = parseFloat(itemList.dataset.gameX);
    const gameY = parseFloat(itemList.dataset.gameY);
    const isAggregated = itemList.dataset.isAggregated === 'true';
    const aggregatedCount = parseInt(itemList.dataset.aggregatedCount) || 1;
    const fixtureId = parseInt(itemList.dataset.fixtureId) || 0;

    dragState.isAggregatedCard = isAggregated && aggregatedCount > 1;
    // Store game coordinates if available (for recalculation during zoom/resize)
    dragState.harvestPoints = [{
        x: harvestX,
        y: harvestY,
        gameX: !isNaN(gameX) ? gameX : null,
        gameY: !isNaN(gameY) ? gameY : null
    }];
    dragState.aggregatedIndices = [];
    dragState.hiddenOriginalPointIndices = [];
    dragState.hasTriggeredRerender = false;
    dragState.fixtureId = fixtureId;

    // For aggregated cards, get original harvest points from pointData
    if (dragState.isAggregatedCard && itemList.dataset.pointData) {
        try {
            const pointData = JSON.parse(itemList.dataset.pointData);
            // Store original point indices to hide during dragging (all except the first one which is the aggregated point)
            if (pointData.aggregatedIndices && Array.isArray(pointData.aggregatedIndices)) {
                dragState.hiddenOriginalPointIndices = [...pointData.aggregatedIndices];
            }
            getAggregatedHarvestPointsFromData(pointData);
        } catch (e) {
            console.error('Failed to parse pointData:', e);
        }
    }

    // Update card styling and disable browser dragging
    itemList.style.cursor = 'grabbing';
    itemList.style.zIndex = 9999;
    itemList.draggable = false;

    // Hide any active item preview tooltip when starting drag
    hideItemPreview();

    // Disable dragging on all images within the card (but keep pointer events enabled)
    const images = itemList.querySelectorAll('img');
    images.forEach(img => {
        img.draggable = false;
        // Don't disable pointerEvents - it breaks the drag interaction!
    });
}

/**
 * Handle pointermove while dragging
 */
function handleCardPointerMove(e) {
    if (!dragState.isDragging || !dragState.draggedCard) return;
    if (dragState.activePointerId !== null && typeof e.pointerId === 'number' && e.pointerId !== dragState.activePointerId) return;

    // Prevent default behavior while dragging
    e.preventDefault();
    e.stopPropagation();

    const coords = getPointerCoordinates(e);

    // Update canvas dimensions in case window was resized during drag
    if (domElements.image && domElements.canvas) {
        const currentImageWidth = domElements.image.clientWidth;
        const currentImageHeight = domElements.image.clientHeight;
        if (domElements.canvas.width !== currentImageWidth || domElements.canvas.height !== currentImageHeight) {
            domElements.canvas.width = currentImageWidth;
            domElements.canvas.height = currentImageHeight;
        }

        // Also update overlay canvas internal resolution to match image dimensions
        // This ensures coordinates stay in sync when page is zoomed or window is resized
        if (overlayCanvas && (overlayCanvas.width !== currentImageWidth || overlayCanvas.height !== currentImageHeight)) {
            overlayCanvas.width = currentImageWidth;
            overlayCanvas.height = currentImageHeight;
        }
    }

    // Update zoom level in case browser was zoomed
    updateZoomLevel();

    const deltaX = coords.x - dragState.dragStartX;
    const deltaY = coords.y - dragState.dragStartY;

    const newX = dragState.dragOffsetX + deltaX;
    const newY = dragState.dragOffsetY + deltaY;

    dragState.draggedCard.style.transform = `translate(${newX}px, ${newY}px)`;

    // Show overlay and draw connection lines
    if (overlayCanvas) {
        overlayCanvas.style.display = 'block';
        drawConnectionLines();
    }
}

/**
 * Handle pointerup/pointercancel to end dragging
 */
function handleCardPointerUp(e) {
    if (!dragState.isDragging || !dragState.draggedCard) return;
    if (dragState.activePointerId !== null && typeof e.pointerId === 'number' && e.pointerId !== dragState.activePointerId) return;

    // Prevent default behavior
    e.preventDefault();
    e.stopPropagation();

    dragState.isDragging = false;
    const card = dragState.draggedCard;

    // Restore original position
    card.style.transform = dragState.originalPosition || 'translate(0px, 0px)';
    card.style.cursor = 'grab';
    card.style.zIndex = 1;

    // Hide any active item preview tooltip
    hideItemPreview();

    // Hide overlay canvas
    if (overlayCanvas) {
        overlayCanvas.style.display = 'none';
        if (overlayCtx) {
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }
    }

    // Release pointer capture to avoid stuck states on touch devices
    if (dragState.activePointerId !== null && dragState.draggedCard && dragState.draggedCard.releasePointerCapture) {
        try {
            dragState.draggedCard.releasePointerCapture(dragState.activePointerId);
        } catch (err) {
            // Ignore if capture was not set
        }
    }

    dragState.draggedCard = null;
    dragState.harvestPoints = [];
    dragState.aggregatedIndices = [];
    dragState.isAggregatedCard = false;
    dragState.hasTriggeredRerender = false;
    dragState.hiddenOriginalPointIndices = [];
    dragState.activePointerId = null;
}

/**
 * Get original harvest points from aggregated card data
 */
function getAggregatedHarvestPointsFromData(pointData) {
    if (!pointData || !pointData.aggregatedIndices) return;

    const sceneNameMap = {
        'scene1': 'さいしょの原っぱ',
        'scene2': '彩りの花畑',
        'scene3': '願いの砂浜',
        'scene4': '忘れ去られた場所'
    };

    const sceneName = sceneNameMap[currentScene];
    if (!sceneName) return;

    const points = sceneState.harvestData[sceneName];
    if (!points || !Array.isArray(points)) return;

    dragState.aggregatedIndices = pointData.aggregatedIndices;

    // Ensure the main card point (harvestPoints[0]) has valid game coordinates
    // For aggregated cards, use the first original point's coordinates as the main point's game coordinates
    if (dragState.harvestPoints.length > 0 && dragState.harvestPoints[0].gameX === null) {
        const firstIdx = pointData.aggregatedIndices[0];
        if (firstIdx < points.length && points[firstIdx] && points[firstIdx].location) {
            let gameX = points[firstIdx].location[0];
            let gameY = points[firstIdx].location[1];
            if (canvasState.reverseXY) {
                [gameX, gameY] = [gameY, gameX];
            }
            dragState.harvestPoints[0].gameX = gameX;
            dragState.harvestPoints[0].gameY = gameY;
        }
    }

    // Get coordinates for all original points in the aggregation
    pointData.aggregatedIndices.forEach((idx, position) => {
        if (idx < points.length) {
            const point = points[idx];
            if (point && point.location) {
                // Apply reverseXY if needed (same as in markPoint)
                let gameX = point.location[0];
                let gameY = point.location[1];
                if (canvasState.reverseXY) {
                    [gameX, gameY] = [gameY, gameX];
                }

                // Convert game coordinates to screen coordinates
                const screenCoords = gameToScreenCoordinates(gameX, gameY);
                dragState.harvestPoints.push({
                    x: screenCoords.x,
                    y: screenCoords.y,
                    gameX: gameX,  // Store game coordinates for recalculation on zoom/resize
                    gameY: gameY,
                    isOriginal: true,
                    index: position + 1 // For labeling (1, 2, 3...)
                });
            }
        }
    });
}

/**
 * Update page zoom level dynamically (handle browser zoom changes during drag)
 */
function updateZoomLevel() {
    const imageContainer = document.querySelector('.image-container');
    if (!imageContainer || domElements.canvas.width === 0) {
        domLayoutState.pageZoomLevel = 1.0;
        return;
    }

    // Calculate zoom level by comparing CSS display size to canvas internal size
    const displayWidth = imageContainer.offsetWidth;
    const internalWidth = domElements.canvas.width;

    if (internalWidth > 0 && displayWidth > 0) {
        domLayoutState.pageZoomLevel = displayWidth / internalWidth;
    } else {
        domLayoutState.pageZoomLevel = 1.0;
    }
}

/**
 * Convert game coordinates to screen coordinates
 * Note: displayGridWidth already includes image scaling (image.clientWidth / image.naturalWidth)
 * so no additional zoom factor is needed
 */
function gameToScreenCoordinates(gameX, gameY) {
    // Scale user-provided offsets with current image scale so mobile layouts stay aligned
    const scale = getImageScale() || 1;
    const offsetX = parseFloat(domElements.offsetXInput.value) * scale;
    const offsetY = parseFloat(domElements.offsetYInput.value) * scale;
    const originX = domElements.canvas.width / 2 + offsetX;
    const originY = domElements.canvas.height / 2 + offsetY;
    const displayGridWidth = parseFloat(domElements.physicalWidthInput.value) * (domElements.image.clientWidth / domElements.image.naturalWidth);

    const displayX = canvasState.xDirection === 'x+' ? originX + gameX * displayGridWidth : originX - gameX * displayGridWidth;
    const displayY = canvasState.yDirection === 'y+' ? originY + gameY * displayGridWidth : originY - gameY * displayGridWidth;

    return { x: displayX, y: displayY };
}

// Point markers visibility is handled automatically by canvas redraw on next render

/**
 * Draw connection lines from dragged card to harvest points
 */
function drawConnectionLines() {
    if (!overlayCanvas || !overlayCtx) return;

    // Clear previous drawing
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Get card element
    const cardElement = dragState.draggedCard;
    if (!cardElement) return;

    const imageContainer = document.querySelector('.image-container');
    if (!imageContainer) return;

    const cardWidth = cardElement.offsetWidth;
    const cardHeight = cardElement.offsetHeight;

    // Get card's actual position relative to overlay canvas
    // Use getBoundingClientRect to account for all positioning including initial offset and transform
    const cardRect = cardElement.getBoundingClientRect();
    const containerRect = imageContainer.getBoundingClientRect();

    // Calculate card position relative to image container
    const cardActualX = cardRect.left - containerRect.left;
    const cardActualY = cardRect.top - containerRect.top;

    const cardCenterX = cardActualX + cardWidth / 2;
    const cardCenterY = cardActualY + cardHeight / 2;

    // Get fixture color
    const fixtureColor = dragState.fixtureId ? FIXTURE_COLORS[dragState.fixtureId] : '#6464FF';
    const isValidColor = fixtureColor && fixtureColor.match(/^#[0-9a-fA-F]{6}$/);
    const rgbColor = isValidColor ? fixtureColor : '#6464FF';

    // Scale stroke and dashes with image scale so lines stay thin on small screens
    const imageScale = getImageScale() || 1;
    const displayGridWidth = parseFloat(domElements.physicalWidthInput.value) * (domElements.image.clientWidth / domElements.image.naturalWidth);
    const scaledOuter = displayGridWidth * 0.65;
    const outerRadius = Math.max(2.5, Math.min(10, scaledOuter));
    const innerRadius = Math.max(1.4, Math.min(6, outerRadius * 0.55));
    const lineWidth = Math.max(1.2, Math.min(4, 3.5 * imageScale));
    const dashSize = Math.max(2, Math.min(6, 5 * imageScale));

    // Parse RGB values from hex color
    const r = parseInt(rgbColor.slice(1, 3), 16);
    const g = parseInt(rgbColor.slice(3, 5), 16);
    const b = parseInt(rgbColor.slice(5, 7), 16);

    // Recalculate screen coordinates from game coordinates for accuracy
    // This ensures lines stay aligned even after zoom/window resize
    // Check if ANY point has valid game coordinates (not just the first one)
    const hasValidGameCoords = dragState.harvestPoints.some(point => point.gameX !== null && point.gameY !== null);
    if (hasValidGameCoords) {
        dragState.harvestPoints.forEach((point) => {
            if (point.gameX !== null && point.gameY !== null) {
                const screenCoords = gameToScreenCoordinates(point.gameX, point.gameY);
                point.x = screenCoords.x;
                point.y = screenCoords.y;
            }
        });
    }

    // Setup line style
    overlayCtx.save();
    overlayCtx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
    overlayCtx.lineWidth = lineWidth;
    overlayCtx.setLineDash([dashSize, dashSize]); // Dashed line

    // Draw lines to harvest points
    if (dragState.isAggregatedCard && dragState.harvestPoints.length > 1) {
        // For aggregated cards with multiple original points, draw lines to each original harvest point
        dragState.harvestPoints.forEach((point) => {
            if (point.isOriginal) {
                overlayCtx.beginPath();
                overlayCtx.moveTo(cardCenterX, cardCenterY);
                overlayCtx.lineTo(point.x, point.y);
                overlayCtx.stroke();

                // Draw endpoint circle with glow effect to match canvas markers
                const baseOpacity = 0.5;
                const gradient = overlayCtx.createRadialGradient(point.x, point.y, 0, point.x, point.y, outerRadius);
                gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${baseOpacity})`);
                gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.5})`);
                gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                overlayCtx.fillStyle = gradient;
                overlayCtx.beginPath();
                overlayCtx.arc(point.x, point.y, outerRadius, 0, Math.PI * 2);
                overlayCtx.fill();

                // Draw inner core
                overlayCtx.fillStyle = rgbColor;
                overlayCtx.beginPath();
                overlayCtx.arc(point.x, point.y, innerRadius, 0, Math.PI * 2);
                overlayCtx.fill();

                // Draw index label
                overlayCtx.fillStyle = 'white';
                const fontSize = Math.max(8, Math.min(11, 11 * imageScale));
                overlayCtx.font = `bold ${fontSize}px Arial`;
                overlayCtx.textAlign = 'center';
                overlayCtx.textBaseline = 'middle';
                overlayCtx.fillText(point.index.toString(), point.x, point.y);
            }
        });
    } else {
        // For single points, draw line to the aggregated point
        const harvestPoint = dragState.harvestPoints[0];
        if (harvestPoint) {
            overlayCtx.beginPath();
            overlayCtx.moveTo(cardCenterX, cardCenterY);
            overlayCtx.lineTo(harvestPoint.x, harvestPoint.y);
            overlayCtx.stroke();

            // Draw endpoint circle with glow effect to match canvas markers
            const baseOpacity = 0.5;
            const gradient = overlayCtx.createRadialGradient(harvestPoint.x, harvestPoint.y, 0, harvestPoint.x, harvestPoint.y, outerRadius);
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${baseOpacity})`);
            gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${baseOpacity * 0.5})`);
            gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            overlayCtx.fillStyle = gradient;
            overlayCtx.beginPath();
            overlayCtx.arc(harvestPoint.x, harvestPoint.y, outerRadius, 0, Math.PI * 2);
            overlayCtx.fill();

            // Draw inner core
            overlayCtx.fillStyle = rgbColor;
            overlayCtx.beginPath();
            overlayCtx.arc(harvestPoint.x, harvestPoint.y, innerRadius, 0, Math.PI * 2);
            overlayCtx.fill();
        }
    }

    overlayCtx.restore();
}

/**
 * Set current scene (called from ui.js)
 */
export function setCurrentScene(sceneKey) {
    currentScene = sceneKey;
}
