// Global state variables
let xDirection = 'x+';
let yDirection = 'y-';
let reverseXY = false;
let currentScene = 'scene1';
let harvestData = {};
let lastUpdateTime = 0;

// Filter variables
let filterMode = 'all'; // 'all', 'rare', 'custom'
let selectedItems = new Set(); // Set of user-selected item IDs
let itemPreview = null; // Item preview element

// Global list to batch position adjustments
let pendingItemPositions = [];

// DOM elements
let image;
let canvas;
let physicalWidthInput;
let offsetXInput;
let offsetYInput;
let ctx;

// Log messages to UI
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

// Parse harvest map data from game API response
function parseMapData(gameData) {
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

// Load data from local mysekai_data.json file
async function loadLocalData() {
    logger('Loading mysekai_data.json...');
    try {
        const response = await fetch('mysekai_data.json');

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }

        const gameData = await response.json();

        harvestData = parseMapData(gameData);
        lastUpdateTime = Date.now() / 1000;

        const sceneNames = Object.keys(harvestData);
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

// Update scene buttons with super rare item indicator
function updateSceneButtonStatus() {
    const sceneNameMap = {
        'scene1': 'さいしょの原っぱ',
        'scene2': '彩りの花畑',
        'scene3': '願いの砂浜',
        'scene4': '忘れ去られた場所'
    };

    for (const sceneKey in sceneNameMap) {
        const sceneName = sceneNameMap[sceneKey];
        const points = harvestData[sceneName];
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

function selectScene(sceneKey) {
    currentScene = sceneKey;
    const selectedScene = SCENES[sceneKey];

    if (selectedScene) {
        // Update button state
        document.querySelectorAll('.scene-buttons button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`button[data-scene="${sceneKey}"]`).classList.add('active');

        physicalWidthInput.value = selectedScene.physicalWidth;
        offsetXInput.value = selectedScene.offsetX;
        offsetYInput.value = selectedScene.offsetY;
        xDirection = selectedScene.xDirection;
        yDirection = selectedScene.yDirection;
        reverseXY = selectedScene.reverseXY;

        logger(`Scene changed: ${sceneKey}`);

        // Set image path and wait for loading to complete
        image.src = selectedScene.imagePath;

        // Wait for image loading before initializing canvas and drawing
        // Use requestAnimationFrame to ensure DOM layout is stable
        // This prevents race conditions when sidebar is closed during scene change
        const initializeCanvasAfterLoad = () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    initCanvas();
                    parseAndMarkPoints();
                });
            });
        };

        if (image.complete) {
            initializeCanvasAfterLoad();
        } else {
            image.onload = initializeCanvasAfterLoad;
        }
    } else {
        logger(`Scene not found: ${sceneKey}`);
    }
}

function initCanvas() {
    canvas.width = image.clientWidth;
    canvas.height = image.clientHeight;
}

// Re-initialize canvas and redraw when window is resized
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    // Delay increased to 400ms to avoid conflicts with sidebar CSS animations (0.3s)
    resizeTimeout = setTimeout(() => {
        initCanvas();
        parseAndMarkPoints();
    }, 400);
});

function drawGrid() {
    const physicalGridWidth = parseFloat(physicalWidthInput.value);
    const offsetX = parseFloat(offsetXInput.value);
    const offsetY = parseFloat(offsetYInput.value);
    const displayWidth = image.clientWidth;
    const displayHeight = image.clientHeight;
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;

    const scaleX = displayWidth / naturalWidth;
    const scaleY = displayHeight / naturalHeight;

    const displayGridWidth = physicalGridWidth * scaleX;

    const originX = displayWidth / 2 + offsetX;
    const originY = displayHeight / 2 + offsetY;

    ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
    ctx.lineWidth = 1;

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

function drawHorizontalLine(y) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
}

function drawVerticalLine(x) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
}

function drawCoordinateAxes(originX, originY) {
    const crossSize = 3;

    ctx.strokeStyle = 'black';
    ctx.beginPath();
    ctx.moveTo(originX - crossSize, originY - crossSize);
    ctx.lineTo(originX + crossSize, originY + crossSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(originX + crossSize, originY - crossSize);
    ctx.lineTo(originX - crossSize, originY + crossSize);
    ctx.stroke();
}

function parseAndMarkPoints() {
    try {
        // Scene name mapping
        const sceneNameMap = {
            'scene1': 'さいしょの原っぱ',
            'scene2': '彩りの花畑',
            'scene3': '願いの砂浜',
            'scene4': '忘れ去られた場所'
        };

        const sceneName = sceneNameMap[currentScene];
        const points = harvestData[sceneName];

        // Clear canvas and items
        initCanvas();
        clearItemLists();

        if (!points) {
            logger(`Scene ${sceneName} has no data`);
            return;
        }

        if (!Array.isArray(points)) {
            logger("Error: Data is not an array");
            return;
        }

        if (!reverseXY) {
            points.forEach(point => markPoint(point));
        } else {
            points.forEach(point => markPoint({location: [point.location[1], point.location[0]], fixtureId: point.fixtureId, reward: point.reward}));
        }

        // Delay position adjustments to after DOM rendering settles
        // This prevents read-write-read conflicts with getBoundingClientRect
        requestAnimationFrame(() => {
            // First, process individual item boundary adjustments
            processPendingItemPositions();
            // Skip collision detection for large numbers of fixtures to avoid layout thrashing
            // O(n²) algorithm becomes expensive with 50+ items during CSS animations
            if (points.length < 50) {
                adjustItemListPositions(5, 5);
            }
        });

        logger(`Marked ${points.length} fixtures`);

        // Update item summary
        updateItemSummary();
    } catch (error) {
        logger("Error marking points: " + error.message);
    }
}

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

function markPoint(point) {
    const [x, y] = point.location;
    const offsetX = parseFloat(offsetXInput.value);
    const offsetY = parseFloat(offsetYInput.value);
    const originX = canvas.width / 2 + offsetX;
    const originY = canvas.height / 2 + offsetY;
    const displayGridWidth = parseFloat(physicalWidthInput.value) * (image.clientWidth / image.naturalWidth);

    const displayX = xDirection === 'x+' ? originX + x * displayGridWidth : originX - x * displayGridWidth;
    const displayY = yDirection === 'y+' ? originY + y * displayGridWidth : originY - y * displayGridWidth;

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
    if (!hasVisibleItems && filterMode !== 'all') {
        return;
    }

    const color = FIXTURE_COLORS[point.fixtureId];

    let ifContainRareItem = false;
    if (color) {
        // Draw point
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(displayX, displayY, 5, 0, Math.PI * 2);
        ctx.fill();

        const containsRareItem = doContainsRareItem(point.reward);
        if (containsRareItem) {
            // Draw red border
            ctx.strokeStyle = 'red';
            ctx.beginPath();
            ctx.arc(displayX, displayY, 5, 0, Math.PI * 2);
            ctx.stroke();
            ifContainRareItem = true;
        } else {
            // Draw black border
            ctx.strokeStyle = 'black';
            ctx.beginPath();
            ctx.arc(displayX, displayY, 5, 0, Math.PI * 2);
            ctx.stroke();
        }

        displayReward(point.reward, displayX + displayGridWidth * 0.6, displayY + displayGridWidth * 0.4, ifContainRareItem);

    } else {
        ctx.fillStyle = 'black';
        ctx.font = '12px Arial';
        ctx.fillText('?', displayX - 3, displayY + 4);
    }
}

function displayReward(reward, x, y, ifContainRareItem) {
    const itemList = document.createElement('div');
    itemList.className = 'item-list';

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
            const texture = ITEM_TEXTURES[category]?.[itemId] || './icon/missing.png';

            const itemEntry = document.createElement('div');
            const itemImage = document.createElement('img');

            if (category == "mysekai_music_record") {
                itemImage.src = './icon/Texture2D/item_surplus_music_record.png';
            } else {
                itemImage.src = texture;
            }

            itemImage.style.cursor = 'pointer';
            itemImage.onmouseover = (e) => {
                showItemPreview(itemImage.src, `${category} #${itemId}`, e.clientX, e.clientY);
            };
            itemImage.onmousemove = (e) => {
                const preview = itemPreview;
                if (preview && preview.classList.contains('active')) {
                    preview.style.left = (e.clientX + 15) + 'px';
                    preview.style.top = (e.clientY + 15) + 'px';
                }
            };
            itemImage.onmouseout = () => {
                hideItemPreview();
            };

            const quantityBadge = document.createElement('span');
            quantityBadge.className = 'quantity';
            quantityBadge.textContent = quantity;

            itemEntry.style.position = 'relative';
            itemEntry.appendChild(itemImage);
            itemEntry.appendChild(quantityBadge);
            if (reverseXY) {
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
            itemList.style.background = 'rgba(255, 0, 0, 0.85)';
        } else {
            itemList.style.background = 'rgba(162, 155, 254, 0.85)';
        }
    }

    const imageContainer = document.querySelector('.image-container');
    imageContainer.appendChild(itemList);

    // Queue position adjustment instead of using setTimeout to avoid event queue congestion
    pendingItemPositions.push({ itemList, x, y });
}

function processPendingItemPositions() {
    if (pendingItemPositions.length === 0) return;

    const imageContainer = document.querySelector('.image-container');
    const containerWidth = imageContainer.offsetWidth;
    const containerHeight = imageContainer.offsetHeight;

    // Process all pending positions in one batch using transform for better performance
    // transform only requires compositing, not layout recalculation
    pendingItemPositions.forEach(({ itemList, x, y }) => {
        const itemRect = itemList.getBoundingClientRect();
        let finalLeft = x;
        let finalTop = y;
        const itemWidth = itemRect.width;
        const itemHeight = itemRect.height;
        const margin = 5;

        // Check if exceeds right boundary
        if (x + itemWidth + margin > containerWidth) {
            finalLeft = Math.max(0, containerWidth - itemWidth - margin);
        }

        // Check if exceeds bottom boundary
        if (y + itemHeight + margin > containerHeight) {
            finalTop = Math.max(0, containerHeight - itemHeight - margin);
        }

        // Check if exceeds top boundary
        if (finalTop < 0) {
            finalTop = margin;
        }

        // Check if exceeds left boundary
        if (finalLeft < 0) {
            finalLeft = margin;
        }

        if (reverseXY) {
            // Use transform instead of left/top for better compositing performance
            itemList.style.left = `0px`;
            itemList.style.top = `0px`;
            itemList.style.transform = `translate(${finalLeft}px, ${finalTop - 10}px)`;
        } else {
            // Use transform instead of left/top for better compositing performance
            itemList.style.left = `0px`;
            itemList.style.top = `0px`;
            itemList.style.transform = `translate(${finalLeft}px, ${finalTop}px)`;
        }
    });

    pendingItemPositions = [];
}

function adjustItemListPositions(maxLapWidth, maxLapHeight) {
    const itemLists = Array.from(document.querySelectorAll('.item-list'));

    for (let i = 0; i < itemLists.length; i++) {
        const rect1 = itemLists[i].getBoundingClientRect();

        for (let j = i; j < itemLists.length; j++) {
            if (i === j) continue;

            const rect2 = itemLists[j].getBoundingClientRect();

            // Check for overlaps exceeding threshold
            const overlapWidth = Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left);
            const overlapHeight = Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top);

            if (overlapWidth > 0 && overlapHeight > 0 && (overlapWidth > maxLapWidth || overlapHeight > maxLapHeight)) {
                // Extract current transform translate values or parse from style
                // Since we use transform, we need to calculate the adjustment and update transform
                const transform = itemLists[j].style.transform;
                const translateMatch = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
                const currentX = translateMatch ? parseFloat(translateMatch[1]) : 0;
                const currentY = translateMatch ? parseFloat(translateMatch[2]) : 0;

                if (reverseXY) {
                    const newY = currentY - overlapHeight / 1.25;
                    itemLists[j].style.transform = `translate(${currentX}px, ${newY}px)`;
                } else {
                    const newX = currentX - overlapWidth / 1.25;
                    itemLists[j].style.transform = `translate(${newX}px, ${currentY}px)`;
                }
            }
        }
    }
}

function setDirection(newXDirection, newYDirection) {
    xDirection = newXDirection;
    yDirection = newYDirection;
    parseAndMarkPoints();
}

function clearItemLists() {
    // Remove all item lists from page
    document.querySelectorAll('.item-list').forEach(item => item.remove());
    // Clear any pending position adjustments
    pendingItemPositions = [];
}

function clearGrid() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Also clear item lists
    clearItemLists();
}

// Filter functions
function toggleFilterPanel() {
    const filterPanel = document.getElementById('filterPanel');
    filterPanel.classList.toggle('active');
    if (filterPanel.classList.contains('active')) {
        initializeItemCheckboxes();
    }
}

function changeFilterMode() {
    const selected = document.querySelector('input[name="filterMode"]:checked');
    filterMode = selected.value;
    const customCheckboxes = document.getElementById('itemCheckboxContainer');

    if (filterMode === 'custom') {
        customCheckboxes.style.display = 'grid';
    } else {
        customCheckboxes.style.display = 'none';
    }

    parseAndMarkPoints();
}

function initializeItemCheckboxes() {
    const container = document.getElementById('itemCheckboxContainer');
    if (container.children.length > 0) return; // Already initialized

    const allItems = [];

    // Collect all items
    for (const category in ITEM_TEXTURES) {
        for (const itemId in ITEM_TEXTURES[category]) {
            allItems.push({ category, itemId, path: ITEM_TEXTURES[category][itemId] });
        }
    }

    // Create checkboxes
    allItems.forEach(item => {
        const checkbox = document.createElement('div');
        checkbox.className = 'item-checkbox';

        const inputId = `item-${item.category}-${item.itemId}`;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = inputId;
        input.value = `${item.category}:${item.itemId}`;
        input.onchange = (e) => {
            if (e.target.checked) {
                selectedItems.add(e.target.value);
            } else {
                selectedItems.delete(e.target.value);
            }
            parseAndMarkPoints();
        };

        const label = document.createElement('label');
        label.htmlFor = inputId;

        const img = document.createElement('img');
        img.src = item.path;
        img.onerror = function() { this.style.display = 'none'; };

        label.appendChild(img);

        checkbox.appendChild(input);
        checkbox.appendChild(label);
        container.appendChild(checkbox);
    });

    // Hide checkbox container by default
    if (filterMode !== 'custom') {
        container.style.display = 'none';
    }
}

function shouldShowItem(category, itemId) {
    if (filterMode === 'all') {
        return true;
    } else if (filterMode === 'rare') {
        const rareItems = RARE_ITEM[category] || [];
        return rareItems.includes(parseInt(itemId));
    } else if (filterMode === 'custom') {
        return selectedItems.has(`${category}:${itemId}`);
    }
    return true;
}

// Initialize item preview
function createItemPreview() {
    if (!itemPreview) {
        itemPreview = document.createElement('div');
        itemPreview.className = 'item-preview';
        document.body.appendChild(itemPreview);
    }
    return itemPreview;
}

function showItemPreview(imgSrc, itemName, mouseX, mouseY) {
    const preview = createItemPreview();
    preview.innerHTML = `<img src="${imgSrc}" onerror="this.style.display='none'">`;
    preview.classList.add('active');
    preview.style.left = (mouseX + 15) + 'px';
    preview.style.top = (mouseY + 15) + 'px';
}

function hideItemPreview() {
    if (itemPreview) {
        itemPreview.classList.remove('active');
    }
}

// Sidebar functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuToggle = document.querySelector('.menu-toggle');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
    menuToggle.style.display = sidebar.classList.contains('active') ? 'none' : 'flex';
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuToggle = document.querySelector('.menu-toggle');
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    menuToggle.style.display = 'flex';
}

function initializeSidebar() {
    const sidebarContent = document.getElementById('sidebarContent');
    const controlsDiv = document.querySelector('.controls');

    if (sidebarContent.innerHTML.trim() === '') {
        sidebarContent.innerHTML = controlsDiv.innerHTML;
    }
}

// Drop Zone and File Upload Functions
let dataLoadedFromFile = false;

function openDropZoneModal() {
    const backdrop = document.getElementById('dropZoneBackdrop');
    backdrop.classList.remove('hidden');
}

function closeDropZoneModal() {
    const backdrop = document.getElementById('dropZoneBackdrop');
    backdrop.classList.add('hidden');
}

function showDataLoadedIndicator(fileName) {
    const indicator = document.createElement('div');
    indicator.className = 'data-loaded-indicator';
    indicator.textContent = `✓ Loaded: ${fileName}`;
    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 3000);
}

function showDataErrorIndicator(message) {
    const indicator = document.createElement('div');
    indicator.className = 'data-error-indicator';
    indicator.textContent = `✗ Error: ${message}`;
    document.body.appendChild(indicator);
    setTimeout(() => indicator.remove(), 4000);
}

function processJsonFile(content, fileName) {
    try {
        const gameData = JSON.parse(content);
        harvestData = parseMapData(gameData);
        lastUpdateTime = Date.now() / 1000;

        const sceneNames = Object.keys(harvestData);
        if (sceneNames.length === 0) {
            logger('Warning: No scene data in file');
            showDataErrorIndicator('No valid scene data found');
            return false;
        }

        logger(`Data loaded from file: ${fileName}`);
        logger('Data loaded: ' + sceneNames.join(', '));
        updateSceneButtonStatus();
        parseAndMarkPoints();
        closeDropZoneModal();
        showDataLoadedIndicator(fileName);
        dataLoadedFromFile = true;
        return true;
    } catch (error) {
        logger('Error parsing JSON: ' + error.message);
        showDataErrorIndicator('Invalid JSON format');
        return false;
    }
}

function handleFileUpload(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        const content = e.target.result;
        processJsonFile(content, file.name);
    };

    reader.onerror = () => {
        logger('Error reading file');
        showDataErrorIndicator('Failed to read file');
    };

    reader.readAsText(file);
}

function initializeDropZone() {
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
            handleFileUpload(files[0]);
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
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

// Calculate and display item summary for current scene
function updateItemSummary() {
    const sceneNameMap = {
        'scene1': 'さいしょの原っぱ',
        'scene2': '彩りの花畑',
        'scene3': '願いの砂浜',
        'scene4': '忘れ去られた場所'
    };

    const sceneName = sceneNameMap[currentScene];
    const points = harvestData[sceneName];
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

// Initialize on page load
window.addEventListener('load', () => {
    // Initialize DOM element references
    image = document.getElementById('image');
    canvas = document.getElementById('gridCanvas');
    physicalWidthInput = document.getElementById('physicalWidth');
    offsetXInput = document.getElementById('offsetX');
    offsetYInput = document.getElementById('offsetY');
    ctx = canvas.getContext('2d');

    logger('Page loaded. Please load a data file to continue.');
    initializeSidebar();
    initializeDropZone();

    // Wait for image loading before initializing canvas
    if (image.complete) {
        // Image is already cached
        initCanvas();
    } else {
        // Wait for image loading
        image.addEventListener('load', () => {
            initCanvas();
        });
    }
    selectScene('scene1');

    // Show upload modal on page load
    openDropZoneModal();
});
