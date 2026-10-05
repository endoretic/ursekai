# Public HTTP rendering

This optional Cloudflare Worker serves the viewer and two public HTTP endpoints.
CORS is enabled for any origin.
Both accept only the [compact JSON format](../README.md#data-file-format).

## Deploy

From this directory, with Node.js 22+ and a Cloudflare account with Browser Run enabled:

```sh
npm ci
npx wrangler login
npm run deploy
```

Use the `workers.dev` address printed by Wrangler as `BASE_URL` below.
The build copies tracked viewer assets and local `assets/3d/models` and
`assets/3d/weather` (see [3D assets](../3D_ASSETS.md)). GitHub Pages loads these models
and textures from the Worker's static asset service using CORS. Matching asset
requests bypass the Worker script and Browser Run. Local samples, raw bundles
and settings are excluded. The homepage is 3D; `/api/render` still opens the separate
2D page, without loading any 3D models or weather effects.
Wrangler creates the SQLite-backed
Durable Object used for daily timing counters; it does not store map data or images.

Browser Run usage is billed to the deploying account. Account quotas and platform
rate limits still apply to public requests. See the official
[Browser Run setup](https://developers.cloudflare.com/browser-run/how-to/deploy-worker/)
and [limits](https://developers.cloudflare.com/browser-run/limits/).

## 1. Load JSON from a URL

`POST /api/load` with `Content-Type: application/json`:

```json
{"url":"https://example.com/maps.json"}
```

Returns the supported JSON, keeping only `updatedResources.userMysekaiHarvestMaps`.
The source may use any public HTTPS hostname on port 443; redirects and IP literals
are rejected. If the source needs authentication, include an optional
`"authorization":"Bearer SOURCE_TOKEN"` in the body. It is sent only to that source.
The source must reply within 15 seconds and its JSON must fit within 4 MiB.

## 2. Render all four maps

`POST /api/render` with `Content-Type: application/json` and the compact JSON itself
as the body. All four site IDs (5, 6, 7, 8) are required. Empty fixture/drop arrays
are allowed; missing maps and other formats return HTTP 400. Request limit: 4 MiB.

```sh
curl "$BASE_URL/api/render" -H 'Content-Type: application/json' \
  --data-binary @maps.json -o images.json
```

To chain the two endpoints:

```sh
curl "$BASE_URL/api/load" -H 'Content-Type: application/json' \
  --data '{"url":"https://example.com/maps.json"}' -o maps.json
curl "$BASE_URL/api/render" -H 'Content-Type: application/json' \
  --data-binary @maps.json -o images.json
```

The response is `{"images":[...]}`, ordered by site ID 5, 6, 7, 8. Each entry contains:

```json
{
  "siteId": 5,
  "name": "さいしょの原っぱ",
  "filename": "grassland.png",
  "mimeType": "image/png",
  "width": 1560,
  "height": 878,
  "missingIcons": [],
  "base64": "PNG_BYTES_AS_BASE64"
}
```

Decode each `base64` value to a file. In iPhone Shortcuts: get the response dictionary,
repeat over `images`, Base64 Decode the `base64` value, then Save to Photo Album or
Save File. The output includes the map and item overlays. `missingIcons` lists
`category:id` entries that used the placeholder.

Choose the card display with `mode=all` (default) or `mode=grouped`:

- `POST /api/render?mode=all`: one card per fixture, matching **All cards**.
- `POST /api/render?mode=grouped`: combine nearby fixtures of the same type with
  identical rewards, matching **Grouped**. The ×N badge is the number of fixtures;
  quantities inside the card remain per fixture.

The same modes work with JPEG, for example
`POST /api/render?format=jpeg&mode=grouped`. Unknown mode values return HTTP 400.

### One tall image for Shortcuts

Use the same JSON body with `POST /api/render?format=jpeg` to receive a single
binary `image/jpeg` response instead of Base64 JSON. Maps are stacked vertically
in site ID order 5, 6, 7, 8. The image uses a 2x pixel density (3120x7020 pixels),
separate high-contrast quantity labels, and JPEG quality 92. Labels and icons are rendered at that
density before capture; backgrounds retain their original 1920x1080 detail.

```sh
curl "$BASE_URL/api/render?format=jpeg" -H 'Content-Type: application/json' \
  --data-binary @maps.json -o mysekai-maps.jpg
```

Responses use `Cache-Control: no-store`; the Worker does not persist payloads or
images. Files opened in the static viewer stay in the browser. Requests to these
HTTP endpoints are processed by the Worker and its Browser Run session.

Errors use `{"error":"message"}`: 400 for invalid input, 404 for unknown routes,
405 for unsupported methods, 413 for oversized JSON, 429 for a busy or paused renderer,
502 for upstream/render failures, 503 for unavailable budget tracking, and 504 for a
render that exceeded its time allowance. Respect `Retry-After` on 429 responses.

## Daily budget (Workers Free)

The renderer uses the Free plan's 600-second daily Browser Run allowance as its budget:

- At 480 seconds (80%), `/api/usage` reports `warning` and records `warningAt`.
- At 540 seconds (90%), new renders return HTTP 429 until the next UTC day.
- A render gets at most 60 seconds, or the remaining budget.
- Only one render runs at a time, with at least 20 seconds between browser launches.
- If browser cleanup cannot be confirmed, rendering pauses for the rest of that UTC day.

`GET /api/usage` is public and returns `{"usage":{...}}`, including `usedSeconds`,
`state`, `active`, `warningAt`, `pausedAt`, and `resetAt`. This is a conservative
application timer, including launch/cleanup overhead, not Cloudflare's billing meter.
It covers this renderer only; other Browser Run applications share the account's
platform quota. The platform's own Free limits still apply.

The warning state is available to external monitoring. Email or push delivery must
be configured separately; publishing the Worker alone does not send notifications.

## Local checks

```sh
npm run check
npm run dev
```

In a second terminal, run an actual HTTP render (without a file argument it uses
four small synthetic maps):

```sh
node check.mjs http://localhost:8787 /path/to/maps.json
node check.mjs "http://localhost:8787?format=jpeg&mode=grouped" /path/to/maps.json
```

The check verifies all four PNG headers and dimensions and saves them under the
ignored `testdata/worker-render/` directory. Review the images for layout and icons.
Cloudflare documents [local browser development](https://developers.cloudflare.com/browser-run/reference/wrangler/).
