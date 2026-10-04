/**
 * Canvas Module
 * Handles all canvas drawing and rendering
 */

import { getFixtureColor, RARE_ITEM, SUPER_RARE_ITEM } from './config.js';
import { setItemImage } from './itemImages.js';
import { domElements, canvasState, domLayoutState, aggregationState, dragState, displayModeState } from './state.js';
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
    // Check if fixture types match
    if (p1.fixtureId !== p2.fixtureId) {
        return false;
    }

    // Calculate distance between points
    const dx = p1.location[0] - p2.location[0];
    const dy = p1.location[1] - p2.location[1];
    return dx * dx + dy * dy <= threshold * threshold;
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
    const rewardKeys = points.map(point => createRewardKey(point.reward));
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
            if (rewardKeys[i] === rewardKeys[j] && canAggregatePoints(points[i], points[j], threshold)) {
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
    sizeCanvas(domElements.canvas, domElements.image.clientWidth, domElements.image.clientHeight);
    updatePageZoomLevel();
}

// Draw in CSS pixels while retaining sharp markers and lines on high-density screens.
export function sizeCanvas(canvas, width, height) {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
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
    const internalWidth = domElements.image.clientWidth;

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

    if (![offsetX, offsetY, displayGridWidth].every(Number.isFinite) || displayGridWidth < 1) {
        window.logger?.('Grid width must produce at least one display pixel; offsets must be numbers.');
        return;
    }

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
    domElements.ctx.lineTo(domElements.image.clientWidth, y);
    domElements.ctx.stroke();
}

/**
 * Draw vertical grid line
 */
function drawVerticalLine(x) {
    domElements.ctx.beginPath();
    domElements.ctx.moveTo(x, 0);
    domElements.ctx.lineTo(x, domElements.image.clientHeight);
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
    const originX = domElements.image.clientWidth / 2 + offsetX;
    const originY = domElements.image.clientHeight / 2 + offsetY;
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

    const color = getFixtureColor(point.fixtureId);
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
 */
export function displayReward(reward, x, y, ifContainRareItem, fragment, isAggregated, aggregatedCount, harvestPointX, harvestPointY, pointData) {
    const itemList = document.createElement('div');
    itemList.className = 'item-list';
    itemList.classList.toggle('horizontal', canvasState.reverseXY);
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
            const quantity = reward[category][itemId];
            // Do NOT multiply quantity for aggregated cards
            // Count badge provides visual indicator instead

            const itemEntry = document.createElement('div');
            itemEntry.className = 'reward-item';
            const itemImage = document.createElement('img');
            setItemImage(itemImage, category, itemId);

            itemImage.style.cursor = 'pointer';
            const quantityBadge = document.createElement('span');
            quantityBadge.className = 'quantity';
            quantityBadge.textContent = quantity;
            itemEntry.appendChild(itemImage);
            itemEntry.appendChild(quantityBadge);

            itemList.appendChild(itemEntry);
        }
    }

    // If no visible items, don't show item card
    if (!hasVisibleItems) {
        return;
    }

    if (ifContainRareItem || reward.hasOwnProperty("mysekai_music_record")) {
        itemList.classList.add(doContainsRareItem(reward, true) ? 'super-rare-card' : 'rare-card');
    }

    // Add small aggregation count indicator if needed
    if (isAggregated && aggregatedCount > 1) {
        const countBadge = document.createElement('span');
        countBadge.className = 'group-count';
        itemList.title = `${aggregatedCount} matching fixtures; quantities are per fixture`;
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
    const pending = domLayoutState.pendingItemPositions;
    domLayoutState.pendingItemPositions = [];
    if (!pending.length) return;
    const container = document.querySelector('.image-container');
    if (!container?.clientWidth || !container.clientHeight) return;

    // Measure once, place with current coordinates, then write once per card.
    const rects = pending.map(({ itemList, x, y }) => ({
        x, y: y - (canvasState.reverseXY ? 10 : 0),
        width: itemList.offsetWidth, height: itemList.offsetHeight
    }));
    const positions = layoutItemRects(rects, container.clientWidth, container.clientHeight);
    const ctx = domElements.ctx;
    ctx.save();
    ctx.lineWidth = 1;
    positions.forEach((rect, index) => {
        const card = pending[index].itemList;
        card.style.left = '0px';
        card.style.top = '0px';
        card.style.transform = `translate(${rect.x}px, ${rect.y}px)`;

        // A displaced card still points to its fixture in a static render.
        const x = Number(card.dataset.harvestX);
        const y = Number(card.dataset.harvestY);
        const edgeX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
        const edgeY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
        if (Math.hypot(x - edgeX, y - edgeY) > 12) {
            ctx.strokeStyle = `${getFixtureColor(Number(card.dataset.fixtureId)) || '#8d91ab'}88`;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(edgeX, edgeY);
            ctx.stroke();
        }
    });
    ctx.restore();
}

// ponytail: greedy placement for small maps; use spatial indexing if fixture counts grow.
export function layoutItemRects(rects, width, height) {
    const margin = 8; // Includes the grouped count badge outside the card border.
    const gap = 8;
    const placed = [];
    for (const rect of rects) {
        const maxX = Math.max(margin, width - rect.width - margin);
        const maxY = Math.max(margin, height - rect.height - margin);
        const clamp = (x, y) => ({
            x: Math.max(margin, Math.min(Number.isFinite(x) ? x : margin, maxX)),
            y: Math.max(margin, Math.min(Number.isFinite(y) ? y : margin, maxY))
        });
        const target = clamp(rect.x, rect.y);
        const candidates = [target];
        for (const other of placed) {
            for (const y of [target.y, other.y]) {
                candidates.push(clamp(other.x - rect.width - gap, y),
                    clamp(other.x + other.width + gap, y));
            }
            for (const x of [target.x, other.x]) {
                candidates.push(clamp(x, other.y - rect.height - gap),
                    clamp(x, other.y + other.height + gap));
            }
        }
        const distance = point => (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
        candidates.sort((a, b) => distance(a) - distance(b));
        let best = target;
        let bestOverlap = Infinity;
        for (const candidate of candidates) {
            let overlap = 0;
            for (const other of placed) {
                const overlapX = Math.max(0, Math.min(candidate.x + rect.width, other.x + other.width)
                    - Math.max(candidate.x, other.x) + gap);
                const overlapY = Math.max(0, Math.min(candidate.y + rect.height, other.y + other.height)
                    - Math.max(candidate.y, other.y) + gap);
                overlap += overlapX * overlapY;
                if (overlap >= bestOverlap) break;
            }
            if (overlap < bestOverlap) {
                best = candidate;
                bestOverlap = overlap;
            }
            if (overlap === 0) break;
        }
        placed.push({ ...rect, ...best });
    }
    return placed;
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
