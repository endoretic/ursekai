/**
 * Canvas Module
 * Handles all canvas drawing and rendering
 */

import { FIXTURE_COLORS, ITEM_TEXTURES, RARE_ITEM, SUPER_RARE_ITEM } from './config.js';
import { domElements, canvasState, domLayoutState, canvasOptimizationState, aggregationState, dragState, displayModeState } from './state.js';
import { shouldShowItem } from './filters.js';

/**
 * Get current display scale of the map image relative to its natural size.
 * Used to keep overlays aligned when the image is resized (mobile/zoom).
 */
export function getImageScale() {
    if (!domElements.image) return 1;

    const naturalWidth = domElements.image.naturalWidth || domElements.image.width || 0;
    const naturalHeight = domElements.image.naturalHeight || domElements.image.height || 0;
    const displayWidth = domElements.image.clientWidth || naturalWidth;
    const displayHeight = domElements.image.clientHeight || naturalHeight;

    if (!naturalWidth || !naturalHeight) {
        return 1;
    }

    const scaleX = displayWidth / naturalWidth;
    const scaleY = displayHeight / naturalHeight;

    // Average the two axes to smooth out minor rounding differences
    return (scaleX + scaleY) / 2;
}

/**
 * Create a unique key for a reward set
 */
function createRewardKey(reward) {
    const entries = [];
    for (const category in reward) {
        if (!reward.hasOwnProperty(category)) continue;
        for (const itemId in reward[category]) {
            if (!reward[category].hasOwnProperty(itemId)) continue;
            const quantity = reward[category][itemId];
            entries.push(category + '_' + itemId + '_' + quantity);
        }
    }
    return entries.sort().join('|');
}

/**
 * Check if two points can be aggregated (same fixture type + same rewards within threshold distance)
 */
function canAggregatePoints(p1, p2, threshold) {
    // Check if rewards are identical
    const rewardKey1 = createRewardKey(p1.reward);
    const rewardKey2 = createRewardKey(p2.reward);
    if (rewardKey1 !== rewardKey2) {
        return false;
    }

    // Check if fixture types match
    if (p1.fixtureId !== p2.fixtureId) {
        return false;
    }

    // Calculate distance between points
    const dx = p1.location[0] - p2.location[0];
    const dy = p1.location[1] - p2.location[1];
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= threshold;
}

/**
 * Aggregate similar points within threshold distance
 * Returns: { aggregatedPoints: [...], pointToGroupKey: {...} }
 */
export function aggregatePoints(points) {
    aggregationState.aggregatedPoints = {};
    aggregationState.pointToAggregationKey = {};

    if (!points || points.length === 0) {
        return {
            displayPoints: [],
            cardPoints: []
        };
    }

    // If display mode is 'all' or aggregation is disabled, show all points as individual cards
    if (!aggregationState.enabled || displayModeState.mode === 'all') {
        const singlePoints = points.map((p, i) => ({ ...p, aggregationKey: 'single_' + i, aggregatedCount: 1, isAggregated: false, isAggregationLeader: true }));
        return {
            displayPoints: singlePoints,      // All points for drawing on canvas
            cardPoints: singlePoints           // Points for generating cards (each point gets its own card)
        };
    }

    const threshold = aggregationState.distanceThreshold;
    const processed = new Set();
    const aggregatedList = [];
    const groupMap = {};  // Maps index to group info
    let groupCounter = 0;
    let aggregatedCount = 0;

    for (let i = 0; i < points.length; i++) {
        if (processed.has(i)) continue;

        const groupKey = 'agg_' + groupCounter++;
        const group = [i];
        processed.add(i);

        // Find all nearby points with same rewards
        for (let j = i + 1; j < points.length; j++) {
            if (processed.has(j)) continue;
            if (canAggregatePoints(points[i], points[j], threshold)) {
                group.push(j);
                processed.add(j);
            }
        }

        // Create aggregated point or single point
        if (group.length > 1) {
            // Multiple points - aggregate
            aggregatedCount++;
            const aggregated = {
                ...points[i],
                aggregationKey: groupKey,
                aggregatedCount: group.length,
                aggregatedIndices: group,
                isAggregated: true
            };
            aggregatedList.push(aggregated);
            aggregationState.aggregatedPoints[groupKey] = aggregated;
            group.forEach(idx => {
                aggregationState.pointToAggregationKey[idx] = groupKey;
                groupMap[idx] = { key: groupKey, isLeader: idx === group[0], indices: group };
            });
            if (aggregationState.debugMode) {
                console.log('Aggregated group ' + groupKey + ': ' + group.length + ' points at location (' + points[i].location[0] + ',' + points[i].location[1] + ')');
            }
        } else {
            // Single point
            const single = {
                ...points[i],
                aggregationKey: 'single_' + i,
                aggregatedCount: 1,
                isAggregated: false
            };
            aggregatedList.push(single);
            aggregationState.pointToAggregationKey[i] = 'single_' + i;
            groupMap[i] = { key: 'single_' + i, isLeader: true, indices: [i] };
        }
    }

    // Create display points (all points) with aggregation info
    const displayPoints = points.map((point, idx) => {
        const groupInfo = groupMap[idx];
        return {
            ...point,
            aggregationKey: groupInfo.key,
            aggregatedCount: groupInfo.indices.length,
            aggregatedIndices: groupInfo.indices,
            isAggregated: groupInfo.indices.length > 1,
            isAggregationLeader: groupInfo.isLeader
        };
    });

    if (aggregationState.debugMode) {
        console.log('Aggregation complete: ' + points.length + ' points (all shown, ' + aggregatedCount + ' aggregated into ' + aggregatedList.length + ' groups)');
    }

    return {
        displayPoints: displayPoints,  // All points for drawing on canvas
        cardPoints: aggregatedList      // Aggregated points for generating cards
    };
}

/**
 * Initialize canvas with proper dimensions
 */
export function initCanvas() {
    domElements.canvas.width = domElements.image.clientWidth;
    domElements.canvas.height = domElements.image.clientHeight;
    updatePageZoomLevel();
}

/**
 * Update page zoom level based on canvas display vs internal size ratio
 */
export function updatePageZoomLevel() {
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
 * Draw grid on canvas for calibration
 */
export function drawGrid() {
    const physicalGridWidth = parseFloat(domElements.physicalWidthInput.value);
    const offsetScale = getImageScale() || 1;
    const offsetX = parseFloat(domElements.offsetXInput.value) * offsetScale;
    const offsetY = parseFloat(domElements.offsetYInput.value) * offsetScale;
    const displayWidth = domElements.image.clientWidth;
    const displayHeight = domElements.image.clientHeight;
    const naturalWidth = domElements.image.naturalWidth;

    const scaleX = displayWidth / naturalWidth;
    const displayGridWidth = physicalGridWidth * scaleX;

    const originX = displayWidth / 2 + offsetX;
    const originY = displayHeight / 2 + offsetY;

    domElements.ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    domElements.ctx.lineWidth = 1;

    for (let y = originY; y >= 0; y -= displayGridWidth) {
        drawHorizontalLine(y);
    }
    for (let y = originY + displayGridWidth; y <= displayHeight; y += displayGridWidth) {
        drawHorizontalLine(y);
    }

    for (let x = originX; x >= 0; x -= displayGridWidth) {
        drawVerticalLine(x);
    }
    for (let x = originX + displayGridWidth; x <= displayWidth; x += displayGridWidth) {
        drawVerticalLine(x);
    }

    drawCoordinateAxes(originX, originY);
}

/**
 * Draw horizontal grid line
 */
function drawHorizontalLine(y) {
    domElements.ctx.beginPath();
    domElements.ctx.moveTo(0, y);
    domElements.ctx.lineTo(domElements.canvas.width, y);
    domElements.ctx.stroke();
}

/**
 * Draw vertical grid line
 */
function drawVerticalLine(x) {
    domElements.ctx.beginPath();
    domElements.ctx.moveTo(x, 0);
    domElements.ctx.lineTo(x, domElements.canvas.height);
    domElements.ctx.stroke();
}

/**
 * Draw coordinate axes on canvas
 */
function drawCoordinateAxes(originX, originY) {
    const crossSize = 3;

    domElements.ctx.strokeStyle = 'black';
    domElements.ctx.beginPath();
    domElements.ctx.moveTo(originX - crossSize, originY - crossSize);
    domElements.ctx.lineTo(originX + crossSize, originY + crossSize);
    domElements.ctx.stroke();

    domElements.ctx.beginPath();
    domElements.ctx.moveTo(originX + crossSize, originY - crossSize);
    domElements.ctx.lineTo(originX - crossSize, originY + crossSize);
    domElements.ctx.stroke();
}

/**
 * Calculate dirty regions by comparing current points with previous render
 */
export function calculateDirtyRegions(newPoints) {
    canvasOptimizationState.dirtyRegions.length = 0;
    const radius = 30; // Radius around each point to redraw

    // Mark regions for points that changed
    newPoints.forEach((point, idx) => {
        const lastPoint = canvasOptimizationState.lastRenderedPoints[idx];
        if (!lastPoint || lastPoint.location[0] !== point.location[0] || lastPoint.location[1] !== point.location[1]) {
            // Point position changed, mark for redraw
            const displayGridWidth = parseFloat(domElements.physicalWidthInput.value) * (domElements.image.clientWidth / domElements.image.naturalWidth);
            const offsetScale = getImageScale() || 1;
            const offsetX = parseFloat(domElements.offsetXInput.value) * offsetScale;
            const offsetY = parseFloat(domElements.offsetYInput.value) * offsetScale;
            const originX = domElements.canvas.width / 2 + offsetX;
            const originY = domElements.canvas.height / 2 + offsetY;

            const [x, y] = point.location;
            const displayX = canvasState.xDirection === 'x+' ? originX + x * displayGridWidth : originX - x * displayGridWidth;
            const displayY = canvasState.yDirection === 'y+' ? originY + y * displayGridWidth : originY - y * displayGridWidth;

            canvasOptimizationState.dirtyRegions.push({
                x: Math.max(0, displayX - radius),
                y: Math.max(0, displayY - radius),
                width: radius * 2,
                height: radius * 2
            });
        }
    });

    // If no dirty regions but point count changed, full redraw
    if (canvasOptimizationState.dirtyRegions.length === 0 && newPoints.length !== canvasOptimizationState.lastRenderedPoints.length) {
        return false; // Signal full redraw needed
    }

    return true; // Partial redraw
}

/**
 * Clear only dirty regions instead of entire canvas
 */
export function clearDirtyRegions() {
    if (!canvasOptimizationState.isDirtyCanvasEnabled || canvasOptimizationState.dirtyRegions.length === 0) {
        return;
    }

    canvasOptimizationState.dirtyRegions.forEach(region => {
        domElements.ctx.clearRect(region.x, region.y, region.width, region.height);
    });
}

/**
 * Mark a single point on canvas with item rewards
 */
export function markPoint(point, fragment) {
    // Check if this is an aggregated point that should be hidden during drag
    const shouldHidePointMarker = dragState.hiddenOriginalPointIndices.length > 0 && point.isAggregated && point.aggregatedIndices &&
                                   point.aggregatedIndices.some(idx => dragState.hiddenOriginalPointIndices.includes(idx));

    const [x, y] = point.location;
    const offsetScale = getImageScale() || 1;
    const offsetX = parseFloat(domElements.offsetXInput.value) * offsetScale;
    const offsetY = parseFloat(domElements.offsetYInput.value) * offsetScale;
    const originX = domElements.canvas.width / 2 + offsetX;
    const originY = domElements.canvas.height / 2 + offsetY;
    const displayGridWidth = parseFloat(domElements.physicalWidthInput.value) * (domElements.image.clientWidth / domElements.image.naturalWidth);

    const displayX = canvasState.xDirection === 'x+' ? originX + x * displayGridWidth : originX - x * displayGridWidth;
    const displayY = canvasState.yDirection === 'y+' ? originY + y * displayGridWidth : originY - y * displayGridWidth;

    // Check if this location has items user wants to see
    let hasVisibleItems = false;
    for (const category in point.reward) {
        if (!point.reward.hasOwnProperty(category)) continue;
        for (const itemId in point.reward[category]) {
            if (!point.reward[category].hasOwnProperty(itemId)) continue;
            if (shouldShowItem(category, itemId)) {
                hasVisibleItems = true;
                break;
            }
        }
        if (hasVisibleItems) break;
    }

    // If no visible items and not showing all, skip this point
    if (!hasVisibleItems) {
        return;
    }

    const color = FIXTURE_COLORS[point.fixtureId];
    const isAggregated = point.isAggregated || false;
    const aggregatedCount = point.aggregatedCount || 1;

    let ifContainRareItem = false;

    // Only draw point marker if not hidden during drag
    if (color && !shouldHidePointMarker) {
        // Scale marker size with current grid width so small screens don't crowd
        const scaledOuter = displayGridWidth * 0.65;
        const outerRadius = Math.max(2.5, Math.min(10, scaledOuter));
        const innerRadius = Math.max(1.4, Math.min(6, outerRadius * 0.55));
        const baseOpacity = 0.5;  // Aggregated and non-aggregated points use same opacity
        const gradient = domElements.ctx.createRadialGradient(displayX, displayY, 0, displayX, displayY, outerRadius);
        gradient.addColorStop(0, 'rgba(' + parseInt(color.slice(1, 3), 16) + ',' + parseInt(color.slice(3, 5), 16) + ',' + parseInt(color.slice(5, 7), 16) + ',' + baseOpacity + ')');
        gradient.addColorStop(0.5, 'rgba(' + parseInt(color.slice(1, 3), 16) + ',' + parseInt(color.slice(3, 5), 16) + ',' + parseInt(color.slice(5, 7), 16) + ',' + (baseOpacity * 0.5) + ')');
        gradient.addColorStop(1, 'rgba(' + parseInt(color.slice(1, 3), 16) + ',' + parseInt(color.slice(3, 5), 16) + ',' + parseInt(color.slice(5, 7), 16) + ',0)');
        domElements.ctx.fillStyle = gradient;
        domElements.ctx.beginPath();
        domElements.ctx.arc(displayX, displayY, outerRadius, 0, Math.PI * 2);
        domElements.ctx.fill();

        // Draw inner core
        domElements.ctx.fillStyle = color;
        domElements.ctx.beginPath();
        domElements.ctx.arc(displayX, displayY, innerRadius, 0, Math.PI * 2);
        domElements.ctx.fill();

        ifContainRareItem = doContainsRareItem(point.reward);
    } else if (color) {
        // Point marker is hidden during drag, but still check for rare items for card styling
        ifContainRareItem = doContainsRareItem(point.reward);
    } else if (!shouldHidePointMarker) {
        domElements.ctx.fillStyle = 'black';
        domElements.ctx.font = '12px Arial';
        domElements.ctx.fillText('?', displayX - 3, displayY + 4);
    }

    // Display reward card only for aggregation leaders or non-aggregated points
    // When aggregation is enabled and all points are displayed on map, only leaders should generate cards
    const shouldDisplayCard = !point.isAggregated || point.isAggregationLeader === true;
    // Use smaller card offsets on mobile so cards stay closer to markers
    const isMobileViewport = domLayoutState?.deviceProfile?.isMobileViewport;
    const cardOffsetX = displayGridWidth * (isMobileViewport ? 0.28 : 0.6);
    const cardOffsetY = displayGridWidth * (isMobileViewport ? 0.2 : 0.4);
    if (shouldDisplayCard) {
        displayReward(point.reward, displayX + cardOffsetX, displayY + cardOffsetY, ifContainRareItem, fragment, isAggregated, aggregatedCount, displayX, displayY, point);
    }
}

/**
 * Display reward items for a fixture
 *
 * DEBUGGING NOTES (v3.5):
 * Testing minimal aggregation rendering to isolate layout issue.
 * Current test: scaleFactor disabled, count badge disabled.
 * If this renders correctly: problem is with scaling/badges
 * If this still breaks: problem is more fundamental with aggregation
 */
export function displayReward(reward, x, y, ifContainRareItem, fragment, isAggregated, aggregatedCount, harvestPointX, harvestPointY, pointData) {
    const itemList = document.createElement('div');
    itemList.className = 'item-list';
    itemList.draggable = false;  // Explicitly mark as non-draggable

    // Store harvest point data for drag interactions
    itemList.dataset.harvestX = harvestPointX || 0;
    itemList.dataset.harvestY = harvestPointY || 0;
    itemList.dataset.isAggregated = isAggregated ? 'true' : 'false';
    itemList.dataset.aggregatedCount = aggregatedCount || 1;

    // Store fixture ID for connection line styling
    if (pointData && pointData.fixtureId) {
        itemList.dataset.fixtureId = pointData.fixtureId;
    }

    // Store game coordinates for dynamic coordinate recalculation during drag
    // This ensures connection lines always use correct coordinates even after zoom/resize
    if (pointData && pointData.location) {
        itemList.dataset.gameX = pointData.location[0];
        itemList.dataset.gameY = pointData.location[1];
    }

    // Store complete point data for aggregated cards and original points
    if (pointData) {
        itemList.dataset.pointData = JSON.stringify({
            location: pointData.location,
            aggregatedIndices: pointData.aggregatedIndices,
            aggregationKey: pointData.aggregationKey,
            isAggregated: pointData.isAggregated
        });
    }

    itemList.style.cursor = 'grab';
    itemList.style.userSelect = 'none';

    // Prevent drag behavior on this card
    itemList.addEventListener('dragstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, true);
    itemList.addEventListener('drag', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, true);

    // Calculate scale factor for aggregated cards (desktop larger, mobile tighter)
    const isMobileViewport = domLayoutState?.deviceProfile?.isMobileViewport;
    const baseScale = isMobileViewport ? 1.05 : 1.35;
    const extraScale = isMobileViewport ? 0.10 : 0.25;
    const scaleFactor = isAggregated && aggregatedCount > 1
        ? baseScale + Math.min(aggregatedCount - 2, 1) * extraScale
        : 1.0;

    if (aggregationState.debugMode && isAggregated && aggregatedCount > 1) {
        console.log('TEST displayReward: scaleFactor enabled, aggregated=' + isAggregated + ', count=' + aggregatedCount + ', scaleFactor=' + scaleFactor.toFixed(2));
    }

    let hasVisibleItems = false;

    for (const category in reward) {
        if (!reward.hasOwnProperty(category)) continue;
        for (const itemId in reward[category]) {
            if (!reward[category].hasOwnProperty(itemId)) continue;

            // Check if this item should be displayed
            if (!shouldShowItem(category, itemId)) {
                continue;
            }

            hasVisibleItems = true;
            let quantity = reward[category][itemId];
            // Do NOT multiply quantity for aggregated cards
            // Count badge provides visual indicator instead

            const texture = ITEM_TEXTURES[category]?.[itemId] || './icon/missing.png';

            const itemEntry = document.createElement('div');
            const itemImage = document.createElement('img');

            if (category == "mysekai_music_record") {
                itemImage.src = './icon/Texture2D/item_surplus_music_record.png';
            } else {
                itemImage.src = texture;
            }

            itemImage.style.cursor = 'pointer';
            // Store data attributes for event delegation
            itemImage.dataset.category = category;
            itemImage.dataset.itemId = itemId;

            // Scale image size using CSS variable base to stay in sync with device profile
            const rootStyles = getComputedStyle(document.documentElement);
            const baseIconSize = parseFloat(rootStyles.getPropertyValue('--card-icon-size')) || 20;
            const imageSize = baseIconSize * scaleFactor;
            itemImage.style.width = imageSize + 'px';
            itemImage.style.height = imageSize + 'px';

            const quantityBadge = document.createElement('span');
            quantityBadge.className = 'quantity';
            quantityBadge.textContent = quantity;
            // Scale badge size for aggregated cards
            if (scaleFactor > 1.0) {
                quantityBadge.style.fontSize = (8 * scaleFactor) + 'px';
                quantityBadge.style.padding = (2 * scaleFactor) + 'px ' + (4 * scaleFactor) + 'px';
            }

            itemEntry.style.position = 'relative';
            itemEntry.appendChild(itemImage);
            itemEntry.appendChild(quantityBadge);
            if (canvasState.reverseXY) {
                itemEntry.style.display = "inline-block"; // Horizontal layout
            }

            itemList.appendChild(itemEntry);
        }
    }

    // If no visible items, don't show item card
    if (!hasVisibleItems) {
        return;
    }

    if (ifContainRareItem || reward.hasOwnProperty("mysekai_music_record")) {
        if (doContainsRareItem(reward, true)) {
            itemList.style.background = 'rgba(197, 100, 119, 0.95)';
        } else {
            itemList.style.background = 'rgba(88, 83, 135, 0.95)';
        }
    }

    // Add small aggregation count indicator if needed
    if (isAggregated && aggregatedCount > 1) {
        const countBadge = document.createElement('div');
        // Badge sized relative to icon scale so it stays compact on small screens
        const rootStyles = getComputedStyle(document.documentElement);
        const baseIconSize = parseFloat(rootStyles.getPropertyValue('--card-icon-size')) || 20;
        const badgeSize = Math.max(18, Math.round(baseIconSize * 0.9));
        countBadge.style.position = 'absolute';
        // Position at top-right corner, extending outside the card border
        countBadge.style.top = '-7px';
        countBadge.style.right = '-7px';
        countBadge.style.background = '#ff6b6b';
        countBadge.style.color = 'white';
        countBadge.style.borderRadius = '50%';
        countBadge.style.width = badgeSize + 'px';
        countBadge.style.height = badgeSize + 'px';
        countBadge.style.display = 'flex';
        countBadge.style.alignItems = 'center';
        countBadge.style.justifyContent = 'center';
        countBadge.style.fontSize = '11px';
        countBadge.style.fontWeight = 'bold';
        countBadge.style.border = '2px solid white';
        countBadge.style.zIndex = '10';
        countBadge.style.pointerEvents = 'none';
        countBadge.textContent = '×' + aggregatedCount;
        itemList.appendChild(countBadge);
    }

    // Add to fragment for batch DOM insertion
    if (fragment) {
        fragment.appendChild(itemList);
    } else {
        document.querySelector('.image-container').appendChild(itemList);
    }

    // Add hover effect to bring card to front when hovered
    itemList.onmouseover = () => {
        itemList.style.zIndex = 9998;
    };
    itemList.onmouseout = () => {
        itemList.style.zIndex = 1;
    };

    // Queue position adjustments for batch processing
    domLayoutState.pendingItemPositions.push({ itemList, x, y });
}

/**
 * Process pending item position adjustments
 */
export function processPendingItemPositions() {
    if (domLayoutState.pendingItemPositions.length === 0) return;

    const imageContainer = document.querySelector('.image-container');
    if (!imageContainer) return;

    // Recalculate zoom level in case page was zoomed (for potential future use)
    updatePageZoomLevel();

    const containerWidth = imageContainer.offsetWidth;
    const containerHeight = imageContainer.offsetHeight;

    // Defensive check: ensure container has valid dimensions
    if (containerWidth <= 0 || containerHeight <= 0) {
        if (aggregationState.debugMode) {
            console.warn('Container has invalid dimensions:', containerWidth, 'x', containerHeight);
        }
        domLayoutState.pendingItemPositions = [];
        return;
    }

    // Process positions in batch using transform for performance (compatible with scaling)
    domLayoutState.pendingItemPositions.forEach(({ itemList, x, y }, index) => {
        try {
            // Get actual dimensions after layout
            const itemWidth = itemList.offsetWidth;
            const itemHeight = itemList.offsetHeight;
            const margin = 5;

            // Note: x/y are already in display space (from markPoint), no additional zoom adjustment needed
            let finalLeft = x;
            let finalTop = y;

            // Defensive: ensure values are numbers
            if (isNaN(finalLeft)) finalLeft = margin;
            if (isNaN(finalTop)) finalTop = margin;

            // Boundary checks with container-relative calculation
            if (finalLeft + itemWidth + margin > containerWidth) {
                finalLeft = Math.max(0, containerWidth - itemWidth - margin);
            }
            if (finalTop + itemHeight + margin > containerHeight) {
                finalTop = Math.max(0, containerHeight - itemHeight - margin);
            }
            if (finalTop < 0) finalTop = margin;
            if (finalLeft < 0) finalLeft = margin;

            // Use transform for compositing performance (compatible with scaling)
            itemList.style.left = '0px';
            itemList.style.top = '0px';
            const translateY = canvasState.reverseXY ? finalTop - 10 : finalTop;

            // Defensive: ensure transform values are valid
            if (!isNaN(finalLeft) && !isNaN(translateY)) {
                itemList.style.transform = `translate(${finalLeft}px, ${translateY}px)`;
            }
        } catch (error) {
            if (aggregationState.debugMode) {
                console.error('Error positioning item', index, ':', error);
            }
        }
    });

    domLayoutState.pendingItemPositions = [];
}

/**
 * Build spatial grid for collision detection
 */
function buildSpatialGrid(cachedRects, gridSize = 220) {
    const grid = {};
    cachedRects.forEach((rect, idx) => {
        const minCellX = Math.floor(rect.left / gridSize);
        const maxCellX = Math.floor(rect.right / gridSize);
        const minCellY = Math.floor(rect.top / gridSize);
        const maxCellY = Math.floor(rect.bottom / gridSize);

        for (let x = minCellX; x <= maxCellX; x++) {
            for (let y = minCellY; y <= maxCellY; y++) {
                const key = `${x},${y}`;
                if (!grid[key]) grid[key] = [];
                grid[key].push(idx);
            }
        }
    });
    return grid;
}

/**
 * Resolve collision between two item lists
 */
function resolveItemCollision(itemList2, rect1, rect2, maxLapWidth, maxLapHeight) {
    const overlapWidth = Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left);
    const overlapHeight = Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top);

    if (overlapWidth > 0 && overlapHeight > 0 && (overlapWidth > maxLapWidth || overlapHeight > maxLapHeight)) {
        const transform = itemList2.style.transform;
        const translateMatch = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
        const currentX = translateMatch ? parseFloat(translateMatch[1]) : 0;
        const currentY = translateMatch ? parseFloat(translateMatch[2]) : 0;

        if (canvasState.reverseXY) {
            itemList2.style.transform = `translate(${currentX}px, ${currentY - overlapHeight / 1.25}px)`;
        } else {
            itemList2.style.transform = `translate(${currentX - overlapWidth / 1.25}px, ${currentY}px)`;
        }
    }
}

/**
 * Adjust item list positions to resolve collisions
 */
export function adjustItemListPositions(maxLapWidth, maxLapHeight) {
    const itemLists = Array.from(document.querySelectorAll('.item-list'));

    // Cache all bounding rects upfront to avoid repeated DOM queries (20-30% performance gain)
    const cachedRects = itemLists.map(item => item.getBoundingClientRect());

    // For small numbers of items, use original O(n²) approach (faster due to no grid overhead)
    if (itemLists.length < 50) {
        for (let i = 0; i < itemLists.length; i++) {
            for (let j = i + 1; j < itemLists.length; j++) {
                resolveItemCollision(itemLists[j], cachedRects[i], cachedRects[j], maxLapWidth, maxLapHeight);
            }
        }
        return;
    }

    // For large numbers of items, use spatial grid for O(n) average complexity
    const grid = buildSpatialGrid(cachedRects, 220);
    const checked = new Set();

    // Check collisions only within grid cells and adjacent cells
    Object.values(grid).forEach(cellIndices => {
        for (let i = 0; i < cellIndices.length; i++) {
            for (let j = i + 1; j < cellIndices.length; j++) {
                const idx1 = cellIndices[i];
                const idx2 = cellIndices[j];
                const key = `${Math.min(idx1, idx2)},${Math.max(idx1, idx2)}`;

                // Avoid checking same pair multiple times (item might be in multiple cells)
                if (!checked.has(key)) {
                    resolveItemCollision(itemLists[idx2], cachedRects[idx1], cachedRects[idx2], maxLapWidth, maxLapHeight);
                    checked.add(key);
                }
            }
        }
    });
}

/**
 * Clear canvas completely
 */
export function clearGrid() {
    // Clear canvas
    domElements.ctx.clearRect(0, 0, domElements.canvas.width, domElements.canvas.height);
    // Also clear item lists
    clearItemLists();
}

/**
 * Clear all item lists from page
 */
export function clearItemLists() {
    // Remove all item lists from page
    document.querySelectorAll('.item-list').forEach(item => item.remove());
    // Clear any pending position adjustments
    domLayoutState.pendingItemPositions = [];
}

/**
 * Helper function: Check if item is rare
 */
function doContainsRareItem(reward, isSuperRare = false) {
    let compareList = isSuperRare ? SUPER_RARE_ITEM : RARE_ITEM;
    for (const category in reward) {
        if (reward.hasOwnProperty(category) && compareList.hasOwnProperty(category)) {
            for (const itemId of Object.keys(reward[category])) {
                if (compareList[category].includes(parseInt(itemId))) {
                    return true;
                }
            }
        }
    }
    return false;
}
