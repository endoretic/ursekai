// Scene configuration - per-scene coordinate transformation parameters
const SCENES = {
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

// Fixture color mapping for different fixture types
const FIXTURE_COLORS = {
    112:  '#f9f9f9',

    1001: '#da6d42', // wood
    1002: '#da6d42',
    1003: '#da6d42',
    1004: '#da6d42',

    2001: '#878685', // iron
    2002: '#d5750a', // copper
    2003: '#d5d5d5', // stone
    2004: '#a7c7cb',
    2005: '#9933cc',

    3001: '#c95a49',

    4001: '#f8729a', // flower
    4002: '#f8729a',
    4003: '#f8729a',
    4004: '#f8729a',
    4005: '#f8729a',
    4006: '#f8729a',
    4007: '#f8729a',
    4008: '#f8729a',
    4009: '#f8729a', // cotton
    4010: '#f8729a',
    4011: '#f8729a',
    4012: '#f8729a',
    4013: '#f8729a',
    4014: '#f8729a',
    4015: '#f8729a',
    4016: '#f8729a',
    4017: '#f8729a',
    4018: '#f8729a',
    4019: '#f8729a',
    4020: '#f8729a',

    5001: '#f6f5f2',
    5002: '#f6f5f2',
    5003: '#f6f5f2',
    5004: '#f6f5f2',
    5101: '#f6f5f2',
    5102: '#f6f5f2',
    5103: '#f6f5f2',
    5104: '#f6f5f2',

    6001: '#6f4e37',

    7001: '#a5d9ff',
};

// Item texture mapping - maps item IDs to their texture asset paths
const ITEM_TEXTURES = {
    mysekai_material: {
        "1": "./icon/Texture2D/item_wood_1.png",
        "2": "./icon/Texture2D/item_wood_2.png",
        "3": "./icon/Texture2D/item_wood_3.png",
        "4": "./icon/Texture2D/item_wood_4.png",
        "5": "./icon/Texture2D/item_wood_5.png",
        "6": "./icon/Texture2D/item_mineral_1.png",
        "7": "./icon/Texture2D/item_mineral_2.png",
        "8": "./icon/Texture2D/item_mineral_3.png",
        "9": "./icon/Texture2D/item_mineral_4.png",
        "10": "./icon/Texture2D/item_mineral_5.png",
        "11": "./icon/Texture2D/item_mineral_6.png",
        "12": "./icon/Texture2D/item_mineral_7.png",
        "13": "./icon/Texture2D/item_junk_1.png",
        "14": "./icon/Texture2D/item_junk_2.png",
        "15": "./icon/Texture2D/item_junk_3.png",
        "16": "./icon/Texture2D/item_junk_4.png",
        "17": "./icon/Texture2D/item_junk_5.png",
        "18": "./icon/Texture2D/item_junk_6.png",
        "19": "./icon/Texture2D/item_junk_7.png",
        "20": "./icon/Texture2D/item_plant_1.png",
        "21": "./icon/Texture2D/item_plant_2.png",
        "22": "./icon/Texture2D/item_plant_3.png",
        "23": "./icon/Texture2D/item_plant_4.png",
        "24": "./icon/Texture2D/item_tone_8.png",
        "32": "./icon/Texture2D/item_junk_8.png",
        "33": "./icon/Texture2D/item_mineral_8.png",
        "34": "./icon/Texture2D/item_junk_9.png",
        "61": "./icon/Texture2D/item_junk_10.png",
        "62": "./icon/Texture2D/item_junk_11.png",
        "63": "./icon/Texture2D/item_junk_12.png",
        "64": "./icon/Texture2D/item_mineral_9.png",
        "65": "./icon/Texture2D/item_mineral_10.png",
    },
    mysekai_item: {
        "7": "./icon/Texture2D/item_blueprint_fragment.png",
    },
    mysekai_fixture: {
        "118": "./icon/Texture2D/mdl_non1001_before_sapling1_118.png",
        "119": "./icon/Texture2D/mdl_non1001_before_sapling1_119.png",
        "120": "./icon/Texture2D/mdl_non1001_before_sapling1_120.png",
        "121": "./icon/Texture2D/mdl_non1001_before_sapling1_121.png",
        "126": "./icon/Texture2D/mdl_non1001_before_sprout1_126.png",
        "127": "./icon/Texture2D/mdl_non1001_before_sprout1_127.png",
        "128": "./icon/Texture2D/mdl_non1001_before_sprout1_128.png",
        "129": "./icon/Texture2D/mdl_non1001_before_sprout1_129.png",
        "130": "./icon/Texture2D/mdl_non1001_before_sprout1_130.png",
        "474": "./icon/Texture2D/mdl_non1001_before_sprout1_474.png",
        "475": "./icon/Texture2D/mdl_non1001_before_sprout1_475.png",
        "476": "./icon/Texture2D/mdl_non1001_before_sprout1_476.png",
        "477": "./icon/Texture2D/mdl_non1001_before_sprout1_477.png",
        "478": "./icon/Texture2D/mdl_non1001_before_sprout1_478.png",
        "479": "./icon/Texture2D/mdl_non1001_before_sprout1_479.png",
        "480": "./icon/Texture2D/mdl_non1001_before_sprout1_480.png",
        "481": "./icon/Texture2D/mdl_non1001_before_sprout1_481.png",
        "482": "./icon/Texture2D/mdl_non1001_before_sprout1_482.png",
        "483": "./icon/Texture2D/mdl_non1001_before_sprout1_483.png"
    },
    mysekai_music_record: {
        "352": "./icon/Texture2D/item_surplus_music_record.png"
    }
};

// Rare item rarity tier definitions
const RARE_ITEM = {
    mysekai_material: [5,12,20, 24, 32, 33, 61, 62, 63, 64, 65],
    mysekai_item: [7],
    mysekai_music_record: [],
    mysekai_fixture: [118,119,120,121]
};

// Super rare item definitions (highest rarity tier)
const SUPER_RARE_ITEM = {
    mysekai_material: [5,12,20,24],
    mysekai_item: [],
    mysekai_fixture: [],
    mysekai_music_record: []
};

// Scene ID mapping for display names
const SITE_ID_MAP = {
    1: "マイホーム",
    2: "1F",
    3: "2F",
    4: "3F",
    5: "さいしょの原っぱ",
    6: "願いの砂浜",
    7: "彩りの花畑",
    8: "忘れ去られた場所",
};
