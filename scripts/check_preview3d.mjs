import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMapData } from '../js/dataParser.js';
import { readCaptureWeather } from '../js/preview3dWeather.js';

// Local exported assets are deliberately ignored by Git. Run after exporting them.
const root = new URL('../assets/3d/', import.meta.url);
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const manifest = await json('models/manifest.json');
const atmosphere = await json('weather/weather.json');
assert.equal(atmosphere.region, 'jp');
assert.equal(Object.keys(atmosphere.weather).length, 17);
const weatherTextures = new Set(Object.values(atmosphere.sprites));
for (let id = 1; id <= 17; id++) {
    const palette = atmosphere.weather[id];
    assert.ok(palette, `Missing JP weather ${id}`);
    for (const color of ['phenomenaDirectionalLightColor', 'phenomenaShadeColor']) {
        assert.ok(['r', 'g', 'b'].every(channel => Number.isFinite(palette.light[color][channel])));
    }
    assert.ok([palette.light.angleXZ, palette.light.angleY, palette.cloud.opacity,
        palette.cloud.size, palette.cloud.speed, ...palette.cloud.direction].every(Number.isFinite));
    weatherTextures.add(palette.ramp);
    if (palette.cloud.texture) weatherTextures.add(palette.cloud.texture);
}
for (const file of weatherTextures) {
    const bytes = await readFile(new URL(`weather/${file}`, root));
    assert.equal(bytes.toString('ascii', 1, 4), 'PNG', `Invalid weather texture ${file}`);
}
assert.deepEqual(Object.keys(manifest.scenes), ['5', '6', '7', '8']);
for (const weather of ['sunny', 'rain', 'evening', 'night']) {
    assert.ok(manifest.weather[weather], `Missing environment ${weather}`);
    assert.ok(Number.isFinite(manifest.weather[weather].angleY));
}
const files = new Set([...Object.values(manifest.scenes), ...Object.values(manifest.fixtures)]);
for (const file of files) {
    const bytes = await readFile(new URL(`models/${file}`, root));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF', file);
    assert.equal(bytes.readUInt32LE(4), 2, file);
    assert.equal(bytes.readUInt32LE(8), bytes.length, file);
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
    const binary = bytes.subarray(28 + jsonLength);
    assert.equal(binary.length, gltf.buffers[0].byteLength, file);
    assert.ok(gltf.meshes.length > 0, file);
    for (const material of gltf.materials) for (const layer of material.extras?.preview?.overlays || []) {
        assert.ok(gltf.textures[layer.index], `${file}: invalid overlay texture`);
        assert.ok([...layer.scale, ...layer.offset, ...layer.scroll].every(Number.isFinite), file);
    }
    for (const view of gltf.bufferViews) {
        assert.ok(view.byteOffset + view.byteLength <= binary.length, file);
        assert.equal(view.byteOffset % 4, 0, file);
    }
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
        const position = gltf.accessors[primitive.attributes.POSITION];
        assert.ok([...position.min, ...position.max].every(Number.isFinite), file);
        for (const index of Object.values(primitive.attributes)) {
            assert.equal(gltf.accessors[index].count, position.count, file);
        }
        const indices = gltf.accessors[primitive.indices];
        const view = gltf.bufferViews[indices.bufferView];
        for (let i = 0; i < indices.count; i++) {
            assert.ok(binary.readUInt32LE(view.byteOffset + i * 4) < position.count, file);
        }
    }
}
// The standalone page has no Activity log. The shared parser must still work.
globalThis.document = { getElementById: () => null };
const sample = JSON.parse(await readFile(new URL('../testdata/harvest-assets/sample.json', import.meta.url), 'utf8'));
const maps = parseMapData(sample);
assert.equal(Object.keys(maps).length, 4);
let points = 0;
for (const map of Object.values(maps)) for (const point of map) {
    assert.ok(manifest.fixtures[point.fixtureId], `Missing sample fixture ${point.fixtureId}`);
    points++;
}
assert.ok(readCaptureWeather(sample), 'Local sample should retain its weather schedule and timestamps');
// Fixed game-day anchor: covers refresh boundaries without the viewing device's time zone or clock.
const anchor = Date.UTC(2026, 9, 1, 21);
const halfDay = 12 * 60 * 60 * 1000;
const capture = {
    mysekaiPhenomenaSchedules: [
        { scheduleDate: anchor, mysekaiRefreshTimePeriodId: 1, mysekaiPhenomenaId: 7 },
        { scheduleDate: anchor, mysekaiRefreshTimePeriodId: 2, mysekaiPhenomenaId: 8 }
    ],
    updatedResources: { now: anchor + halfDay, userMysekaiGamedata: { refreshedAt: anchor + 1 } }
};
assert.equal(readCaptureWeather(capture).id, 7, 'Map refresh takes priority over response time');
delete capture.updatedResources.userMysekaiGamedata;
for (const [time, expected] of [[anchor - 1, null], [anchor, 7], [anchor + halfDay - 1, 7],
    [anchor + halfDay, 8], [anchor + halfDay * 2, null]]) {
    capture.updatedResources.now = time;
    assert.equal(readCaptureWeather(capture)?.id ?? null, expected);
}
assert.equal(readCaptureWeather({ updatedResources: {} }), null, 'Map-only JSON still works');
assert.equal(readCaptureWeather({ ...capture, mysekaiPhenomenaSchedules: [] }), null);
console.log(`Local 3D checks passed: ${files.size} GLBs, 4 maps, ${points} sample harvest objects, 17 JP palettes and weather boundaries.`);
