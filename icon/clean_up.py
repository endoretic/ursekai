# https://sekai.best/asset_viewer/mysekai/item_preview
import os

files = {
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
    "_7": "./icon/Texture2D/item_blueprint_fragment.png",
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
    "483": "./icon/Texture2D/mdl_non1001_before_sprout1_483.png",
    "_music": "./icon/Texture2D/item_surplus_music_record.png"
}.values()

files = [f.replace("./icon/Texture2D/", "") for f in files]

for file in os.listdir("./icon/Texture2D"):
    if file not in files:
        os.remove(f"./icon/Texture2D/{file}")