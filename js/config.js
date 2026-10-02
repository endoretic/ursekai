import { ITEM_CATALOG, HARVEST_FIXTURE_TYPES } from './masterdata.js';

// Scene configuration - per-scene coordinate transformation parameters
export const SCENES = {
    scene1: {
        physicalWidth: 33.333,
        offsetX: 0,
        offsetY: -40,
        imagePath: "img/grassland.png",
        xDirection: 'x-',
        yDirection: 'y-',
        reverseXY: true,
    },
    scene2: {
        physicalWidth: 24.806,
        offsetX: -62.015,
        offsetY: 20.672,
        imagePath: "img/flowergarden.png",
        xDirection: 'x-',
        yDirection: 'y-',
        reverseXY: true,
    },
    scene3: {
        physicalWidth: 20.513,
        offsetX: 0,
        offsetY: 80,
        imagePath: "img/beach.png",
        xDirection: 'x+',
        yDirection: 'y-',
        reverseXY: false,
    },
    scene4: {
        physicalWidth: 21.333,
        offsetX: 0,
        offsetY: -106.667,
        imagePath: "img/memorialplace.png",
        xDirection: 'x+',
        yDirection: 'y-',
        reverseXY: false,
    }
};

// Keep the existing palette while deriving current fixture IDs from JP master data.
const FIXTURE_TYPE_COLORS = {
    treasure_box_transport: '#f9f9f9',
    treasure_box_fixed: '#f9f9f9',
    wood: '#8B6F47',
    mineral: '#878685',
    toolbox: '#4A90E2',
    plant: '#ffd380',
    other: '#f6f5f2',
    driftage: '#6f4e37',
    tone: '#a5d9ff',
    birthday_plant: '#f8729a'
};

export const DEFAULT_FIXTURE_COLOR = '#6464FF';
export const FIXTURE_COLORS = {
    ...Object.fromEntries(Object.entries(HARVEST_FIXTURE_TYPES).map(([id, type]) =>
        [id, FIXTURE_TYPE_COLORS[type] || DEFAULT_FIXTURE_COLOR]
    )),
    2002: '#d5750a',
    2003: '#d5d5d5',
    2004: '#a7c7cb',
    2005: '#9933cc',
    // Preserve legacy IDs for older payloads.
    4018: '#ffd380',
    4019: '#ffd380',
    4020: '#ffd380'
};

export function getFixtureColor(fixtureId) {
    return FIXTURE_COLORS[fixtureId] || DEFAULT_FIXTURE_COLOR;
}

export const MISSING_TEXTURE = './icon/missing.png';
export const ITEM_ASSET_BASE_URL = 'https://storage.sekai.best/sekai-jp-assets';
export const MUSIC_RECORD_TEXTURE = './icon/Texture2D/item_surplus_music_record.png';
export const ITEM_TEXTURES = {
    ...Object.fromEntries(Object.entries(ITEM_CATALOG).map(([category, items]) => [
        category,
        Object.fromEntries(Object.entries(items).map(([id, item]) => [id, `./icon/Texture2D/${item.icon}`]))
    ])),
    mysekai_music_record: { 352: MUSIC_RECORD_TEXTURE }
};

export function getItemTexture(category, itemId) {
    if (category === 'mysekai_music_record') return MUSIC_RECORD_TEXTURE;
    return ITEM_TEXTURES[category]?.[itemId] || MISSING_TEXTURE;
}

export function getRemoteItemTexture(category, itemId) {
    if (category === 'mysekai_music_record') {
        return `${ITEM_ASSET_BASE_URL}/mysekai/thumbnail/item/item_surplus_music_record.png`;
    }
    const item = ITEM_CATALOG[category]?.[itemId];
    return item ? `${ITEM_ASSET_BASE_URL}/${item.folder}/${item.remoteIcon || item.icon}` : MISSING_TEXTURE;
}

export function getItemName(category, itemId) {
    if (category === 'mysekai_music_record') return `Music record #${itemId}`;
    return ITEM_CATALOG[category]?.[itemId]?.name || `${category} #${itemId}`;
}

// Game rarity 4 denotes Memoria, which stays outside the existing rare-material filter.
export const RARE_ITEM = {
    mysekai_material: [...new Set([
        ...Object.entries(ITEM_CATALOG.mysekai_material)
            .filter(([, item]) => ['rarity_2', 'rarity_3'].includes(item.rarity))
            .map(([id]) => Number(id)),
        24
    ])],
    mysekai_item: [7],
    mysekai_music_record: [],
    mysekai_fixture: [118, 119, 120, 121]
};

// Preserve the viewer's special highlight policy rather than treating Memoria as super rare.
export const SUPER_RARE_ITEM = {
    mysekai_material: [5, 12, 20, 24],
    mysekai_item: [],
    mysekai_fixture: [],
    mysekai_music_record: []
};

// Scene ID mapping for display names
export const SITE_ID_MAP = {
    1: "マイホーム",
    2: "1F",
    3: "2F",
    4: "3F",
    5: "さいしょの原っぱ",
    6: "願いの砂浜",
    7: "彩りの花畑",
    8: "忘れ去られた場所"
};
