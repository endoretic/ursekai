# pjsk-mysekai-xray

A goldminer, visualizer, a cheater (or anything you'd like to call) for ur sekai.

## Prerequisites

I do not provide, nor do I have the methods and capabilities for packet capture and reverse analysis.

Please figure it out yourself.

Or you might refer to <https://github.com/mos9527/sssekai>

When you're done, rename THAT SHIT to `mysekai_data.json` and place it under root directory.

## How to Start

You **need a local server** to read the JSON file (browser security restriction).

### Option 1: Using launcher script

```bash
# Windows
start_webui.bat

# Linux/Mac
python3 webui.py
```

### Option 2: Using Python's built-in HTTP server

```bash
# Navigate to project directory, then run:
python -m http.server 8000

# Open browser to: http://localhost:8000/paint_local.html
```

Press `Ctrl+C` to stop the server.

## Supported Scenes

| Scene ID | Japanese Name | English Name |
|----------|---------------|--------------|
| 5 | さいしょの原っぱ | Grassland |
| 6 | 願いの砂浜 | Beach |
| 7 | 彩りの花畑 | Flower Garden |
| 8 | 忘れ去られた場所 | Memorial Place |

## Project Structure

```text
pjsk-mysekai-xray-prototype/
├── paint_local.html              # Main viewer (open this file!)
├── mysekai_data.json             # Game data (required)
├── start_server.py               # Optional: local server launcher
├── start_server.bat              # Convenience: Windows launcher
├── icon/
│   ├── Texture2D/                # 53 item texture files
│   └── clean_up.py               # Asset verification utility
├── img/                           # 4 scene background images
├── CLAUDE.md                      # Developer documentation
├── OFFLINE_USAGE.md              # Offline usage guide (Chinese)
├── README.md                      # This file
└── LICENSE                        # MIT License
```

## How It Works

### Data Processing Pipeline

```text
mysekai_data.json
        ↓
paint_local.html (browser loads & parses directly)
  ├─ Fetch mysekai_data.json
  ├─ Parse map data with parseMapData() function
  │   └─ Extract spawned fixtures & their rewards
  └─ Render visual overlay on canvas
        ↓
Canvas Rendering
  ├─ Coordinate transformation (3D → 2D)
  ├─ Color coding (by material type)
  └─ Texture overlay (item icons)
        ↓
Display in browser
```

### Core Functions

- `parseMapData(gameData)` - Parse raw game API response
- `loadLocalData()` - Load mysekai_data.json file
- `parseAndMarkPoints()` - Mark all fixtures on current scene
- `markPoint(point)` - Draw individual fixture on canvas
- `displayReward(reward, x, y)` - Show item rewards at fixture location

## Data File Format

`mysekai_data.json` should looks like：

```json
{
  "updatedResources": {
    "userMysekaiHarvestMaps": [
      {
        "mysekaiSiteId": 5,
        "userMysekaiSiteHarvestFixtures": [...],
        "userMysekaiSiteHarvestResourceDrops": [...]
      }
    ]
  }
}
```

## Item Types and Colors

The tool uses color coding to distinguish between different material types:

| Type | Fixture ID Range | Color | Examples |
|------|------------------|-------|----------|
| Wood | 1000-1999 | #da6d42 (Brown) | Charcoal, branches |
| Mineral | 2000-2999 | #878685 (Gray) | Iron ore, copper ore |
| Plant | 4000-4999 | #f8729a (Pink) | Flowers, cotton |
| Special | 5000-5999 | #f6f5f2 (White) | Music records |
| Model | 6000-6999 | #6f4e37 (Brown) | Saplings, etc |

## Manual Asset Updates

If the project's icon directory doesn't contain the latest game resources:

1. Check the browser console log (F12) to find missing item IDs
2. Download the texture from [sekai.best item preview](https://sekai.best/asset_viewer/mysekai/item_preview)
3. Add the downloaded PNG to `icon/Texture2D/` directory
4. Register the item ID in `paint_local.html` under the `ITEM_TEXTURES` JSON mapping

## License

MIT License - See [LICENSE](LICENSE) file for details

## Credits & Attribution

- **Original Work:** MiddleRed/pjsk-mysekai-xray (MIT), by @MiddleRed.
- **Modifications by @endoretic (2025):** removed the “unsettling” parts, now it only shows a few useless images.
- **Tools:** I don't, and can't code. Claude Code & ChatGPT did everything.

---

**Note**: This project is for testing and educational purposes. All resources belongs to Project SEKAI.
