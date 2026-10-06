import assert from 'node:assert/strict';
import { aggregatePoints, layoutItemRects, sizeCanvas, drawGrid } from '../js/canvas.js';
import { displayModeState, domElements } from '../js/state.js';
import { doContainsRareItem } from '../js/filters.js';

for (const itemId of [5, 12, 20, 24]) {
    assert.equal(doContainsRareItem({ mysekai_material: { [itemId]: 1 } }, true), true);
    assert.equal(doContainsRareItem({ mysekai_material: { [itemId]: 0 } }, true), false);
}
assert.equal(doContainsRareItem({ mysekai_material: { 1: 2, 67: 1 } }, true), false);
assert.equal(doContainsRareItem({ mysekai_music_record: { 5: 1 } }, true), false);
assert.equal(doContainsRareItem({}, true), false);

const point = (x, fixtureId = 1001, quantity = 2) => ({
    location: [x, 0], fixtureId, reward: { mysekai_material: { 1: quantity } }
});
const points = [point(0), point(4), point(20), point(2, 1002), point(3, 1001, 3)];
const original = structuredClone(points);
displayModeState.mode = 'aggregated';
const grouped = aggregatePoints(points);
assert.equal(grouped.displayPoints.length, points.length);
assert.equal(grouped.cardPoints.length, 4);
assert.deepEqual(grouped.cardPoints[0].aggregatedIndices, [0, 1]);
assert.equal(grouped.cardPoints[0].reward.mysekai_material[1], 2);
assert.deepEqual(points, original);
displayModeState.mode = 'all';
assert.equal(aggregatePoints(points).cardPoints.length, points.length);

const rects = Array.from({ length: 20 }, () => ({ x: 580, y: -10, width: 90, height: 35 }));
const placed = layoutItemRects(rects, 640, 400);
assert.deepEqual(placed, layoutItemRects(rects, 640, 400), 'Layout must be deterministic');
for (const [index, a] of placed.entries()) {
    assert.ok(a.x >= 8 && a.y >= 8 && a.x + a.width <= 632 && a.y + a.height <= 392);
    for (const b of placed.slice(index + 1)) {
        const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
            * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        assert.equal(area, 0, 'Cards must use current positions when avoiding collisions');
    }
}

globalThis.localStorage = {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); }
};
assert.doesNotThrow(() => displayModeState.init());
assert.doesNotThrow(() => displayModeState.setMode('aggregated'));
assert.equal(displayModeState.mode, 'aggregated');
delete globalThis.localStorage;

let transform;
globalThis.window = { devicePixelRatio: 2 };
const canvas = { getContext: () => ({ setTransform: (...args) => { transform = args; } }) };
sizeCanvas(canvas, 320, 180);
assert.equal(canvas.width, 640);
assert.equal(canvas.height, 360);
assert.deepEqual(transform, [2, 0, 0, 2, 0, 0]);
domElements.image = { naturalWidth: 1920, naturalHeight: 1080, clientWidth: 320, clientHeight: 180 };
domElements.offsetXInput = { value: '0' };
domElements.offsetYInput = { value: '0' };
domElements.ctx = new Proxy({}, { get() { throw new Error('Invalid grid must not start drawing'); } });
for (const value of ['0', '-1', '', '0.001']) {
    domElements.physicalWidthInput = { value };
    assert.doesNotThrow(() => drawGrid());
}
delete globalThis.window;
console.log('Renderer checks passed: super rare drops, grouping, bounded collision layout, blocked storage, pixel density and invalid grid.');
