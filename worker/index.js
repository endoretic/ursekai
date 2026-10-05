import { parseMapData } from '../js/dataParser.js';
import { SITE_ID_MAP } from '../js/config.js';
import { isIP } from 'node:net';

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const DAILY_BROWSER_MS = 10 * 60 * 1000;
const WARNING_MS = DAILY_BROWSER_MS * 0.8;
const STOP_MS = DAILY_BROWSER_MS * 0.9;
const MAX_RENDER_MS = 60000;
const API_HEADERS = {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Retry-After'
};
const MAPS = [
    { siteId: 5, scene: 'scene1', filename: 'grassland.png' },
    { siteId: 6, scene: 'scene3', filename: 'beach.png' },
    { siteId: 7, scene: 'scene2', filename: 'flowergarden.png' },
    { siteId: 8, scene: 'scene4', filename: 'memorialplace.png' }
];

function fail(status, message) {
    throw Object.assign(new Error(message), { status });
}

function json(value, status = 200) {
    return Response.json(value, { status, headers: API_HEADERS });
}

async function readJson(message) {
    if (!message.body) fail(400, 'JSON body is required');
    let size = 0;
    const chunks = [];
    for await (const chunk of message.body) {
        size += chunk.byteLength;
        if (size > MAX_BODY_BYTES) fail(413, 'JSON exceeds 4 MiB');
        chunks.push(chunk);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
        fail(400, 'Invalid JSON');
    }
}

function harvestJson(data, requireFourMaps = false) {
    let parsed;
    try {
        parsed = parseMapData(data);
    } catch {
        fail(400, 'Only compact MySekai API JSON is supported');
    }
    if (!Object.keys(parsed).length) fail(400, 'No scene data found');
    if (requireFourMaps && MAPS.some(map => !Object.hasOwn(parsed, SITE_ID_MAP[map.siteId]))) {
        fail(400, 'All four maps (site IDs 5, 6, 7, 8) are required');
    }
    return { updatedResources: { userMysekaiHarvestMaps: data.updatedResources.userMysekaiHarvestMaps } };
}

async function loadFromUrl(input) {
    let url;
    try { url = new URL(input.url); } catch { fail(400, 'A JSON URL is required'); }
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || isIP(hostname) ||
        !hostname.includes('.') || /\.(?:localhost|local|internal)$/.test(hostname)) {
        fail(400, 'JSON URL must use a public HTTPS hostname on port 443');
    }
    if (input.authorization !== undefined && typeof input.authorization !== 'string') {
        fail(400, 'Source authorization must be a string');
    }
    let response;
    try {
        response = await fetch(url, {
            redirect: 'manual', signal: AbortSignal.timeout(15000),
            headers: input.authorization ? { Authorization: input.authorization } : {}
        });
    } catch { fail(502, 'JSON source could not be reached'); }
    if (!response.ok) fail(502, `JSON source returned HTTP ${response.status}`);
    return harvestJson(await readJson(response));
}

async function renderMaps(data, env, origin, durationMs, format, mode) {
    const { default: puppeteer } = await import('@cloudflare/puppeteer');
    const started = Date.now();
    const browser = await puppeteer.launch(env.BROWSER);
    let phase = 'opening the viewer';
    let closing;
    const close = () => closing ||= browser.close();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        close().catch(() => {});
    }, Math.max(1, durationMs - (Date.now() - started)));
    try {
        const page = await browser.newPage();
        const strip = format === 'jpeg';
        await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: strip ? 2 : 1 });
        await page.goto(`${origin}/paint_local.html?render=1&mode=${mode}`, { waitUntil: 'load', timeout: 30000 });
        if (strip) {
            phase = 'preparing all four maps';
            // Scene loading, image readiness and panel copies stay inside the browser to avoid remote round trips.
            await page.evaluate(async ({ payload, maps }) => {
                await window.MySekaiXray.ready;
                window.MySekaiXray.loadJson(payload);
                const stack = document.createElement('div');
                stack.id = 'render-map-strip';
                stack.style.cssText = 'display:flex;flex-direction:column;width:max-content;';
                for (const map of maps) {
                    await window.MySekaiXray.selectScene(map.scene);
                    const source = document.querySelector('.image-container');
                    const deadline = performance.now() + 20000;
                    // Keep the viewer's icon fallback handlers intact while waiting for their final source.
                    while (![...source.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0)) {
                        if (performance.now() >= deadline) throw new Error(`Images did not load for map ${map.siteId}`);
                        await new Promise(resolve => setTimeout(resolve, 16));
                    }
                    const { width, height } = source.getBoundingClientRect();
                    const panel = source.cloneNode(true);
                    const canvases = panel.querySelectorAll('canvas');
                    source.querySelectorAll('canvas').forEach((canvas, index) => {
                        // cloneNode copies canvas dimensions, but not its pixels.
                        canvases[index].getContext('2d').drawImage(canvas, 0, 0);
                    });
                    panel.style.width = `${width}px`;
                    panel.style.height = `${height}px`;
                    panel.style.flexShrink = '0';
                    stack.append(panel);
                }
                // Cloned images must finish decoding before the single screenshot.
                await Promise.all([...stack.querySelectorAll('img')].map(image => image.decode()));
                document.body.replaceChildren(stack);
                document.body.style.cssText = 'margin:0;padding:0;display:block;min-height:0;';
            }, { payload: data, maps: MAPS });
            phase = 'capturing all four maps';
            const element = await page.$('#render-map-strip');
            const picture = await element.screenshot({ type: 'jpeg', quality: 92, captureBeyondViewport: true });
            if (timedOut) fail(504, 'Rendering exceeded its time budget');
            return picture;
        }
        phase = 'initializing the viewer';
        await page.evaluate(async payload => {
            await window.MySekaiXray.ready;
            window.MySekaiXray.loadJson(payload);
        }, data);
        const images = [];
        for (const map of MAPS) {
            phase = `loading map ${map.siteId}`;
            await page.evaluate(scene => window.MySekaiXray.selectScene(scene), map.scene);
            await page.waitForFunction(() => [...document.querySelectorAll('.image-container img')]
                .every(image => image.complete && image.naturalWidth > 0), { timeout: 20000 });
            const element = await page.$('.image-container');
            const bounds = await element.boundingBox();
            const missing = await page.evaluate(() => [...document.querySelectorAll('.item-list img')]
                .filter(image => new URL(image.src).pathname.endsWith('/missing.png'))
                .map(image => `${image.dataset.category}:${image.dataset.itemId}`));
            phase = `capturing map ${map.siteId}`;
            const base64 = await element.screenshot({ type: 'png', encoding: 'base64' });
            images.push({
                siteId: map.siteId, name: SITE_ID_MAP[map.siteId], filename: map.filename,
                mimeType: 'image/png', width: Math.round(bounds.width), height: Math.round(bounds.height),
                missingIcons: [...new Set(missing)], base64
            });
        }
        if (timedOut) fail(504, 'Rendering exceeded its time budget');
        return { images };
    } catch (error) {
        if (timedOut) fail(504, `Rendering exceeded its time budget while ${phase}`);
        throw error;
    } finally {
        clearTimeout(timer);
        try { await close(); } catch (error) {
            error.closeFailed = true;
            throw error;
        }
    }
}

function usage(data) {
    return {
        day: data.day,
        usedSeconds: Math.ceil(data.usedMs / 1000),
        limitSeconds: DAILY_BROWSER_MS / 1000,
        warningSeconds: WARNING_MS / 1000,
        stopSeconds: STOP_MS / 1000,
        state: data.pausedAt ? 'paused' : data.usedMs >= WARNING_MS ? 'warning' : 'ok',
        active: Boolean(data.active), warningAt: data.warningAt || null, pausedAt: data.pausedAt || null,
        resetAt: new Date(Date.parse(`${data.day}T00:00:00Z`) + 86400000).toISOString()
    };
}

// ponytail: one render at a time; use multiple reservations if concurrent rendering becomes necessary.
// One object per UTC day serializes browser launches across all Worker instances.
// Only timing counters are stored; map JSON and images never enter Durable Object storage.
export class RenderBudget {
    constructor(ctx) { this.ctx = ctx; }

    async fetch(request) {
        return this.ctx.blockConcurrencyWhile(async () => {
            const now = Date.now();
            const path = new URL(request.url).pathname;
            const data = await this.ctx.storage.get('usage') || {
                day: new Date(now).toISOString().slice(0, 10), usedMs: 0
            };
            // An interrupted request keeps its reservation and pauses the day conservatively.
            if (data.active && now > data.active.deadline + 60000) {
                data.usedMs += data.active.durationMs;
                data.active = null;
                data.pausedAt = new Date(now).toISOString();
            }
            let status = 200;
            let result;
            let retryAfter;
            if (path === '/reserve') {
                if (data.pausedAt || data.usedMs >= STOP_MS) {
                    data.pausedAt ||= new Date(now).toISOString();
                    status = 429;
                    result = { error: 'Daily rendering budget reached; try after reset' };
                    retryAfter = Math.max(1, Math.ceil((Date.parse(usage(data).resetAt) - now) / 1000));
                } else if (data.active || now < (data.nextLaunchAt || 0)) {
                    status = 429;
                    result = { error: 'Renderer is busy; retry shortly' };
                    retryAfter = Math.max(1, Math.ceil(((data.active?.deadline || data.nextLaunchAt) - now) / 1000));
                } else {
                    const durationMs = Math.min(MAX_RENDER_MS, STOP_MS - data.usedMs);
                    data.active = { id: crypto.randomUUID(), started: now, deadline: now + durationMs, durationMs };
                    data.nextLaunchAt = now + 20000;
                    result = { id: data.active.id, durationMs };
                }
            } else if (path === '/finish') {
                const input = await request.json();
                if (!data.active || data.active.id !== input.id) return json({ error: 'Unknown reservation' }, 409);
                data.usedMs += Math.max(0, now - data.active.started);
                data.active = null;
                if (!input.closed || data.usedMs >= STOP_MS) data.pausedAt ||= new Date(now).toISOString();
            } else if (path !== '/usage') {
                return json({ error: 'Not found' }, 404);
            }
            if (data.usedMs >= WARNING_MS) data.warningAt ||= new Date(now).toISOString();
            await this.ctx.storage.put('usage', data);
            const response = json({ ...result, usage: usage(data) }, status);
            if (retryAfter) response.headers.set('Retry-After', String(retryAfter));
            return response;
        });
    }
}

function budgetForToday(env) {
    if (!env.RENDER_BUDGET) fail(503, 'Rendering budget is not configured');
    return env.RENDER_BUDGET.get(env.RENDER_BUDGET.idFromName(new Date().toISOString().slice(0, 10)));
}

async function renderWithBudget(data, env, origin, format, mode) {
    const budget = budgetForToday(env);
    const reservationResponse = await budget.fetch('https://budget/reserve', { method: 'POST' });
    if (!reservationResponse.ok) return reservationResponse;
    const reservation = await reservationResponse.json();
    let closed = true;
    try {
        const result = await renderMaps(data, env, origin, reservation.durationMs, format, mode);
        if (format === 'jpeg') return new Response(result, { headers: {
            ...API_HEADERS, 'Content-Type': 'image/jpeg',
            'Content-Disposition': 'inline; filename="mysekai-maps.jpg"'
        } });
        return json(result);
    } catch (error) {
        closed = !error.closeFailed;
        throw error;
    } finally {
        const settled = await budget.fetch('https://budget/finish', {
            method: 'POST', body: JSON.stringify({ id: reservation.id, closed })
        });
        if (!settled.ok) fail(503, 'Rendering budget could not be updated');
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
        if (!['/api/load', '/api/render', '/api/usage'].includes(url.pathname)) return json({ error: 'Not found' }, 404);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: API_HEADERS });
        try {
            if (url.pathname === '/api/usage') {
                if (request.method !== 'GET') return json({ error: 'Use GET' }, 405);
                return await budgetForToday(env).fetch('https://budget/usage');
            }
            if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
            const input = await readJson(request);
            if (!input || typeof input !== 'object') fail(400, 'A JSON object is required');
            if (url.pathname === '/api/load') return json(await loadFromUrl(input));
            const format = url.searchParams.get('format') || 'json';
            if (!['json', 'jpeg'].includes(format)) fail(400, 'Render format must be json or jpeg');
            const mode = url.searchParams.get('mode') ?? 'all';
            if (!['all', 'grouped'].includes(mode)) fail(400, 'Render mode must be all or grouped');
            return await renderWithBudget(harvestJson(input, true), env, url.origin, format, mode);
        } catch (error) {
            return json({ error: error.status ? error.message : 'Rendering failed' }, error.status || 502);
        }
    }
};
