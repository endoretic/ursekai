import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import worker, { RenderBudget } from './index.js';

const data = { updatedResources: { userMysekaiHarvestMaps: [5, 6, 7, 8].map(id => [
    id, [[1001, 0, 0, 90, 'spawned']],
    [['mysekai_material', 1, 0, 0, 1, 1, 'before_drop', 2]]
]) } };
const post = (path, body) => new Request(`https://maps.example${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});
const call = (path, body) => worker.fetch(post(path, body), {});
const preflight = await worker.fetch(new Request('https://maps.example/api/render', { method: 'OPTIONS' }), {});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
assert.equal((await call('/api/render', {})).status, 400);
assert.equal((await call('/api/render', { updatedResources: { userMysekaiHarvestMaps: [[5, [], []]] } })).status, 400);
assert.equal((await call('/api/unknown', data)).status, 404);
assert.equal((await worker.fetch(new Request('https://maps.example/api/render'), {})).status, 405);
assert.equal((await call('/api/render', 'x'.repeat(4 * 1024 * 1024))).status, 413);

const realFetch = globalThis.fetch;
try {
    let fetches = 0;
    globalThis.fetch = async (url, options) => {
        fetches++;
        assert.equal(url.href, 'https://any-source.example/maps.json');
        assert.equal(options.redirect, 'manual');
        assert.equal(options.headers.Authorization, 'Bearer source-only');
        return Response.json({ ...data, unrelatedPersonalField: 'must not be returned' });
    };
    const loaded = await call('/api/load', {
        url: 'https://any-source.example/maps.json', authorization: 'Bearer source-only'
    });
    assert.equal(loaded.status, 200);
    assert.equal(loaded.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await loaded.json(), data);
    for (const url of ['http://example.com/a', 'https://localhost/a', 'https://127.0.0.1/a',
        'https://[::1]/a', 'https://a.local/a', 'https://user:pass@example.com/a', 'https://example.com:8443/a']) {
        assert.equal((await call('/api/load', { url })).status, 400);
    }
    assert.equal(fetches, 1);
    globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example' } });
    assert.equal((await call('/api/load', { url: 'https://example.com/a' })).status, 502);
    globalThis.fetch = async () => Response.json({ oldFormat: [] });
    assert.equal((await call('/api/load', { url: 'https://example.com/a' })).status, 400);
    globalThis.fetch = async () => { throw new Error('upstream failure'); };
    assert.equal((await call('/api/load', { url: 'https://example.com/a' })).status, 502);
} finally {
    globalThis.fetch = realFetch;
}
console.log('API checks passed: public access, CORS, compact JSON, URL validation and size limit.');

// Exercise the spending boundary without launching browsers or consuming cloud quota.
const realNow = Date.now;
let now = Date.parse('2026-10-03T12:00:00Z');
let saved = { day: '2026-10-03', usedMs: 479000 };
const budget = new RenderBudget({
    blockConcurrencyWhile: callback => callback(),
    storage: {
        get: async () => structuredClone(saved),
        put: async (_key, value) => { saved = structuredClone(value); }
    }
});
const budgetCall = (path, body) => budget.fetch(post(path, body));
try {
    Date.now = () => now;
    const reservation = await (await budgetCall('/reserve')).json();
    assert.equal(reservation.durationMs, 60000);
    assert.equal((await budgetCall('/reserve')).status, 429);
    now += 1000;
    const warned = await (await budgetCall('/finish', { id: reservation.id, closed: true })).json();
    assert.equal(warned.usage.state, 'warning');
    assert.equal(warned.usage.usedSeconds, 480);
    assert.ok(warned.usage.warningAt);
    assert.equal((await budgetCall('/finish', { id: reservation.id, closed: true })).status, 409);
    const throttled = await budgetCall('/reserve');
    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get('Retry-After'), '19');
    now += 20000;
    saved.usedMs = 539000;
    const last = await (await budgetCall('/reserve')).json();
    assert.equal(last.durationMs, 1000);
    now += 1000;
    const stopped = await (await budgetCall('/finish', { id: last.id, closed: true })).json();
    assert.equal(stopped.usage.state, 'paused');
    assert.equal(stopped.usage.usedSeconds, 540);
    assert.equal(stopped.usage.resetAt, '2026-10-04T00:00:00.000Z');
    assert.equal((await budgetCall('/reserve')).status, 429);
    saved = undefined;
    now = Date.parse('2026-10-04T00:00:00Z');
    const fresh = await (await budgetCall('/reserve')).json();
    assert.equal(fresh.usage.usedSeconds, 0);
    assert.equal(fresh.usage.state, 'ok');
    now += 120001;
    const interrupted = await (await budgetCall('/usage')).json();
    assert.equal(interrupted.usage.state, 'paused');
    assert.equal(interrupted.usage.active, false);
    saved = undefined;
    const unclosed = await (await budgetCall('/reserve')).json();
    assert.equal((await (await budgetCall('/finish', { id: unclosed.id, closed: false })).json()).usage.state, 'paused');
} finally {
    Date.now = realNow;
}
console.log('Budget checks passed: warning at 80%, stop at 90%, throttling, UTC reset and interrupted cleanup.');

// Optional HTTP smoke check: node check.mjs http://localhost:8787 [local JSON file] [output directory]
if (process.argv[2]) {
    const source = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) : data;
    const payload = JSON.stringify({ updatedResources: {
        userMysekaiHarvestMaps: source.updatedResources.userMysekaiHarvestMaps
    } });
    const started = performance.now();
    const response = await fetch(new URL('/api/render', process.argv[2]), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
        signal: AbortSignal.timeout(180000)
    });
    const result = await response.json();
    console.log(JSON.stringify({ status: response.status, elapsedSeconds: (performance.now() - started) / 1000 }));
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.deepEqual(result.images.map(image => image.siteId), [5, 6, 7, 8]);
    const output = resolve(process.argv[4] || '../testdata/worker-render');
    await mkdir(output, { recursive: true });
    for (const image of result.images) {
        const png = Buffer.from(image.base64, 'base64');
        assert.equal(image.mimeType, 'image/png');
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(png.readUInt32BE(16), image.width);
        assert.equal(png.readUInt32BE(20), image.height);
        assert.ok(image.width > 500 && image.height > 500);
        assert.deepEqual(image.missingIcons, [], `Missing icons on map ${image.siteId}`);
        await writeFile(resolve(output, `${image.siteId}.png`), png);
        console.log(JSON.stringify({ siteId: image.siteId, width: image.width, height: image.height,
            bytes: png.length, missingIcons: image.missingIcons }));
    }
    console.log(`Four PNG files saved to ${output}`);
}
