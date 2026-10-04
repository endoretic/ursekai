# pjsk-mysekai-xray

A goldminer, visualizer, a cheater (or anything you'd like to call) for ur sekai.

## Prerequisites

I do not provide, nor do I have the methods and capabilities for packet capture and reverse analysis.

Please refer to <https://github.com/mos9527/sssekai> for more details.

## How to Start

<https://endoretic.github.io/ursekai-xray/>. (Or run `start_webui.bat` to start a local server)

## Supported Scenes

| Scene ID | Japanese Name | English Name |
|----------|---------------|--------------|
| 5 | さいしょの原っぱ | Grassland |
| 6 | 願いの砂浜 | Beach |
| 7 | 彩りの花畑 | Flower Garden |
| 8 | 忘れ去られた場所 | Memorial Place |

## Project Structure

```text
ursekai-xray/
├── paint_local.html              # Main viewer (browser-based)
├── index.html                    # Web UI entry point
├── start_webui.bat               # Windows local server launcher
├── webui.py                      # Python local server
├── icon/
│   ├── Texture2D/                # Item texture PNG files
│   ├── clean_up.py               # Asset verification utility
│   └── missing.png               # Missing texture placeholder
├── img/                          # Scene background images
├── css/                          # Stylesheet files
├── js/                           # JavaScript modules
├── README.md                     # This file
└── LICENSE                       # MIT License
```

## How It Works

### Data Processing Pipeline

```text
User uploads JSON file
        ↓
paint_local.html (parses data in browser)
  ├─ Parse map data with parseMapData()
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
- `handleFileUpload(file)` - Handle uploaded JSON file
- `parseAndMarkPoints()` - Mark all fixtures on current scene
- `markPoint(point)` - Draw individual fixture on canvas
- `displayReward(reward, x, y)` - Show item rewards at fixture location

## Data File Format

Only decrypted API JSON with compact positional harvest rows is supported:

```json
{
  "updatedResources": {
    "userMysekaiHarvestMaps": [
      [
        5,
        [[1001, -11, -5, 90, "spawned", null]],
        [["mysekai_material", 1, -11, -5, 1, 1, "before_drop", 2, null]]
      ]
    ]
  }
}
```

Each map row contains `[siteId, fixtures, drops]`. Fixture rows contain
`[fixtureId, x, z, hp, status, ...]`; drop rows contain
`[resourceType, resourceId, x, z, hp, sequence, status, quantity, ...]`.
Other JSON layouts are rejected with an error.

## HTTP Automation

Base URL: [ursekai-xray-renderer.endoretic.workers.dev](https://ursekai-xray-renderer.endoretic.workers.dev).
Send request bodies as `application/json` using the compact format above.

| Endpoint | Request body | Response |
|----------|--------------|----------|
| `POST /api/load` | `{"url":"https://example.com/maps.json"}` | Compact map JSON, ready for `/api/render` |
| `POST /api/render` | Compact map JSON | Four PNGs in `{"images":[...]}`, each with a `base64` field |
| `POST /api/render?format=jpeg` | Compact map JSON | One JPEG with all four maps stacked vertically |
| `GET /api/usage` | None | Shared daily rendering budget and status |

Rendering requires all four site IDs (5, 6, 7, 8), which also determine image order.
Add `mode=all` (default) or `mode=grouped` to either render format. Grouped cards
combine nearby matching fixtures; `×N` is the fixture count, while card quantities
remain per fixture. For example:

```text
POST /api/render?format=jpeg&mode=grouped
```

Usage reports `warning` at 80% of the configured daily browser budget. Rendering
pauses at 90% and resumes at the next UTC day. See the [Worker guide](worker/README.md)
for deployment, response fields, and request examples.

## Item Types and Colors

The tool uses color coding to distinguish between different material types:

| Type | Fixture ID Range | Color | Examples |
|------|------------------|-------|----------|
| Treasure box | 111-112 | #f9f9f9 (White) | Treasure boxes |
| Wood | 1000-1999 | #8B6F47 (Brown) | Charcoal, branches |
| Mineral | 2000-2999 | #878685 (Gray), with mineral-specific accents | Iron ore, copper ore |
| Toolbox | 3000-3999 | #4A90E2 (Blue) | Tools |
| Plant | 4000-4999 | #ffd380 (Yellow) | Flowers, cotton |
| Special | 5000-5999 | #f6f5f2 (White) | Music records |
| Driftage | 6000-6999 | #6f4e37 (Brown) | Driftage |
| Tone | 7000-7999 | #a5d9ff (Light blue) | Tones |
| Birthday plant | 8000-8999 | #f8729a (Pink) | Celebration flowers |

## Updating JP Drops and Harvest Fixtures

From the repository root, run with Python (standard library only):

```powershell
python scripts/update_masterdata.py --download-icons
```

This updates `js/masterdata.js` from public JP data in
[Sekai-World/sekai-master-db-diff](https://github.com/Sekai-World/sekai-master-db-diff)
and downloads missing icons into `icon/Texture2D/`. Existing icons are preserved.

- Omit `--download-icons` to update metadata only.
- Use `--ref <commit SHA>` to reproduce a snapshot.
- Add `--material-id <ID>` for specific ordinary reward icons; repeat for multiple IDs.

Commit metadata and required icons together so GitHub Pages and the Worker each
include their own assets. Check all four maps, filters, previews, and desktop/mobile
layouts with a local sample, then run `node scripts/check_parser.mjs` (Node.js 20+).
Do not commit personal payloads. Public data may include unreleased items.

## License

MIT License - See [LICENSE](LICENSE) file for details

## Rings of Power

- **Original Work:** MiddleRed/pjsk-mysekai-xray (MIT), by @MiddleRed.
- **My Precious:** Claude & Codex.

---

**Note**: This project is for testing and educational purposes. All resources belongs to Project SEKAI.
