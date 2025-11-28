/**
 * Filters Module
 * Handles all filtering logic for items
 */

import { RARE_ITEM, SUPER_RARE_ITEM, ITEM_TEXTURES } from './config.js';
import { filterState, FILTER_DEBOUNCE_DELAY } from './state.js';

// Callback for redrawing points - set by ui.js during initialization
let onFilterChange = null;

/**
 * Set the callback for when filter changes
 */
export function setFilterChangeCallback(callback) {
    onFilterChange = callback;
}

/**
 * Check if item should be displayed based on current filter
 */
export function shouldShowItem(category, itemId) {
    if (filterState.filterMode === 'all') {
        return true;
    } else if (filterState.filterMode === 'rare') {
        const rareItems = RARE_ITEM[category] || [];
        return rareItems.includes(parseInt(itemId));
    } else if (filterState.filterMode === 'custom') {
        return filterState.selectedItems.has(`${category}:${itemId}`);
    }
    return true;
}

/**
 * Change filter mode and trigger redraw
 */
export function changeFilterMode() {
    const selected = document.querySelector('input[name="filterMode"]:checked');
    filterState.filterMode = selected.value;
    const customCheckboxes = document.getElementById('itemCheckboxContainer');

    if (filterState.filterMode === 'custom') {
        customCheckboxes.style.display = 'grid';
    } else {
        customCheckboxes.style.display = 'none';
    }

    // Debounce filter changes to avoid multiple redraws during rapid filter toggles
    clearTimeout(filterState.filterDebounceTimer);
    filterState.filterDebounceTimer = setTimeout(() => {
        if (onFilterChange) {
            onFilterChange();
        }
    }, FILTER_DEBOUNCE_DELAY);
}

/**
 * Initialize item checkboxes for custom filter
 */
export function initializeItemCheckboxes() {
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
                filterState.selectedItems.add(e.target.value);
            } else {
                filterState.selectedItems.delete(e.target.value);
            }
            // Debounce checkbox changes to batch multiple selections into one redraw
            clearTimeout(filterState.filterDebounceTimer);
            filterState.filterDebounceTimer = setTimeout(() => {
                if (onFilterChange) {
                    onFilterChange();
                }
            }, FILTER_DEBOUNCE_DELAY);
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
    if (filterState.filterMode !== 'custom') {
        container.style.display = 'none';
    }
}

/**
 * Toggle filter panel visibility
 */
export function toggleFilterPanel() {
    const filterPanel = document.getElementById('filterPanel');
    filterPanel.classList.toggle('active');
    if (filterPanel.classList.contains('active')) {
        initializeItemCheckboxes();
    }
}

/**
 * Check if reward contains rare item
 */
export function doContainsRareItem(reward, isSuperRare = false) {
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
