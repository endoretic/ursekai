# 3D assets and rendering

Serve this checkout and open `index.html`. Prepare the local assets below first.
Click **Load JSON** to select a compact decrypted JSON file. Full decrypted
responses are accepted too. Files are processed in the browser.

- Left-drag to move along the ground; right-drag to tilt and rotate; scroll to zoom toward the pointer.
- Touch: one finger to move, two fingers to turn and zoom. Arrow keys pan; Shift+arrows turn.
- **Top view** and **Reset view** restore camera positions.
- The default camera height is twice the reference tree's height above the map center.
- Drop labels stay facing the camera; select a label or harvest object for details.
- Weather follows the JSON's recorded map-refresh time, with no manual weather control.
- Labels and animated water can be toggled. Drops always come directly from the JSON.

The input is the same compact decrypted JSON as the 2D viewer. For automatic weather,
keep `mysekaiPhenomenaSchedules` and `updatedResources.userMysekaiGamedata.refreshedAt`
when stripping the response. `updatedResources.now` is used if the refresh time is
absent. No new fields are required; map-only files still work with default lighting
and an explicit missing-weather note.
The schedule is resolved at the recorded timestamp, not today's date. IDs and
12-hour slots follow [phenomena](https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/mysekaiPhenomenas.json)
and [refresh periods](https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/mysekaiRefreshTimePeriods.json).

Full decrypted responses work directly. The default private-pipeline response,
Shadowrocket cache and public HTTP renderer still retain only harvest maps; those
paths do not forward weather metadata. The 3D homepage does not change them.

This entry is independent of the 2D viewer and HTTP renderer and does not use
Browser Run. Weather and water animate at up to 20 fps, pause in hidden tabs, and
reuse fixed particle buffers. Camera input still redraws immediately.

## Deployment assets

Ignored `assets/3d/models` and `assets/3d/weather` contain the models and selected
weather textures/settings. They are uploaded only to the Worker's static assets;
the public GitHub repository does not contain them. The online homepage loads them
from `https://ursekai-renderer.endoretic.workers.dev/assets/3d/` with CORS enabled.
On localhost it uses `./assets/3d/` instead. Three.js 0.162.0 is tracked separately
in `vendor/three/` with its MIT license. No release download or fallback is used.
The model/texture URLs are publicly accessible even though the files are not in Git.
Game resources remain the property of their respective owners; the source-code
license does not relicense them.

Raw bundles, extraction caches and personal JSON samples stay in ignored
`testdata/harvest-assets/` and are never included in Git or the site build.
The GLBs were exported from CN 6.0.0 / ios42 Unity bundles; fixture names are mapped
through the existing JP harvest master table. Weather uses **JP 7.0.0.15 / iOS**
bundles, resolved on 2026-10-05 using the public JP version metadata and local
sssekai ([version source](https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/versions.json)).
All 17 weather palettes and their dependencies were downloaded separately
into `testdata/harvest-assets/jp-weather-bundles/`. No keys, decryption code or
external CDN requests are part of the viewer.

To regenerate from local decoded UnityFS bundles, use a Python environment with
UnityPy and Pillow:

```powershell
python scripts/export_harvest_models.py testdata/harvest-assets/bundles testdata/harvest-assets/harvest-master.json assets/3d/models
python scripts/export_preview_weather.py testdata/harvest-assets/jp-weather-bundles assets/3d/weather --asset-version 7.0.0.15
node scripts/check_preview3d.mjs
```

To use the currently deployed public assets locally, download `models/manifest.json`
and its referenced GLBs, plus `weather/weather.json` and its referenced PNGs, from
the asset base URL above into `assets/3d/`, preserving their paths.

The local check also uses `testdata/harvest-assets/sample.json`; keep that sample
private. Keep deployed resources limited to the model manifest and its referenced
GLBs, weather settings and referenced PNGs, and Three.js with its license.
Do not commit game resources, raw bundles or extraction caches.

Terrain blending and water scrolling use source material settings. Weather uses
the JP light colors/directions, sky gradient textures, cloud-shadow settings and
nine selected particle textures. Snow, rain, meteor trails, bubbles and notes use
small shared particle pools; full moon, rainbow and star fields add simple sky
geometry. Moon/rainbow are above the horizon: tilt the camera toward the sky to see
them. Clouds also shade the terrain without another shadow-map pass.

This is an approximation, not a Unity particle-system port. The original layered
emitters, precise timings, distortion/soft-particle shaders, bloom/color grading,
ground reflections, planet/UFO objects and underwater fish are not reproduced.
Thunder uses one gentle light pulse, without audio. There is no snow accumulation
or physical weather simulation. Particle-only harvest fixtures still report a
missing model. Harvest heights project onto the terrain; trees use the standing state.
