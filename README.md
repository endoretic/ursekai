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

The public renderer is hosted at
[ursekai-xray-renderer.endoretic.workers.dev](https://ursekai-xray-renderer.endoretic.workers.dev).
Both endpoints are public and require no access token or browser visit:

- `POST /api/load` with `{"url":"https://example.com/maps.json"}` loads compact JSON from a URL.
- `POST /api/render` with that JSON returns four PNG images as Base64, one per map.

The renderer requires all four site IDs (5, 6, 7, 8). See the [Worker guide](worker/README.md) for
deployment, request examples, response fields, and iPhone Shortcuts steps. These
endpoints run at the deployed Worker's address; the GitHub Pages viewer stays static.
`GET /api/usage` reports the shared daily budget. Rendering pauses at 90% of the
Free plan's daily browser allowance and resumes at the next UTC day.

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

Run from the repository root with Python (standard library only):

```powershell
python scripts/update_masterdata.py --download-icons
```

The updater reads the latest public Japanese master data from
[Sekai-World/sekai-master-db-diff](https://github.com/Sekai-World/sekai-master-db-diff),
pins all six tables to the same commit, and writes `js/masterdata.js`. It includes
materials, items, ungrown plants (the furniture that can drop), and harvest fixture
types, plus ordinary materials used by birthday/campaign rewards. The generated
file records the source commit and timestamp. Public master
data can include entries that are not yet obtainable in game.

To reproduce a specific snapshot, pass `--ref <commit SHA>`. Omit `--download-icons`
to update metadata only. The checked-in snapshot is from 2026-10-02, commit
`db430d712d9418d11977d7fa2b188b0babd30071`.

Missing icons are downloaded from Sekai Viewer's
[current thumbnail directory](https://sekai.best/asset_viewer/mysekai/thumbnail)
into `icon/Texture2D/`. Existing icons are preserved. Commit the downloaded icons
with metadata updates so GitHub Pages and the Worker each deploy their own copy.
For offline use, run with `--download-icons`. A deployed copy without the required
icons tries the public CDN, then `icon/missing.png`.
Files opened in the viewer are parsed locally in the browser;
HTTP rendering requests are processed by the deployed Worker.

Ordinary material icons load on demand from the CDN. To keep particular rewards
available offline, append `--material-id 179 --material-id 201` (replace IDs with
those in your sample) when downloading icons. The custom filter lists only the
ordinary materials present in the uploaded maps, not the entire game's shop.
`python icon/clean_up.py` audits local MySekai icons without deleting files.

`js/config.js` derives texture and fixture mappings from the generated catalog.
It preserves the existing palette and special highlights, uses game rarity 2/3
for rare materials, and keeps Memoria outside that filter. Unknown future fixtures
receive a visible default marker. The parser accepts only the compact positional
harvest rows shown above.

After an update, load a local JSON sample and check all four scenes, item previews,
rare/custom filters, card dragging, and desktop/mobile layouts. New resource IDs
in a sample remain selectable in the custom filter even before the next catalog
update. Do not commit personal test payloads.

For the parser's small dependency-free regression check (Node.js 20+):
`node scripts/check_parser.mjs`.

## License

MIT License - See [LICENSE](LICENSE) file for details

## Credits & Attribution

- **Original Work:** MiddleRed/pjsk-mysekai-xray (MIT), by @MiddleRed.
- **Modifications by @endoretic (2025):** removed the “unsettling” parts, now it only shows a few useless images.
- **Tools:** I don't, and can't code. Claude Code & ChatGPT did everything.

---

**Note**: This project is for testing and educational purposes. All resources belongs to Project SEKAI.
