import assert from 'node:assert/strict';

// The parser only uses the DOM for log messages.
const element = () => ({ appendChild() {} });
globalThis.document = { createElement: element, getElementById: element };
const { parseMapData, processJsonFile, handleFileUpload } = await import('../js/dataParser.js');

const standard = { updatedResources: { userMysekaiHarvestMaps: [{
    mysekaiSiteId: 5,
    userMysekaiSiteHarvestFixtures: [
        { mysekaiSiteHarvestFixtureId: 8001, positionX: -2, positionZ: 3, hp: 0,
            userMysekaiSiteHarvestFixtureStatus: 'spawned' },
        { mysekaiSiteHarvestFixtureId: 1001, positionX: 1, positionZ: 1, hp: 0,
            userMysekaiSiteHarvestFixtureStatus: 'harvested' }
    ],
    userMysekaiSiteHarvestResourceDrops: [2, 3].map(quantity => ({
        resourceType: 'mysekai_material', resourceId: 67, positionX: -2, positionZ: 3, quantity
    }))
}] } };
const compact = { updatedResources: { userMysekaiHarvestMaps: [[
    5, [[8001, -2, 3, 0, 'spawned', null], [1001, 1, 1, 0, 'harvested', null]],
    [['mysekai_material', 67, -2, 3, 1, 1, 'before_drop', 2, null],
        ['mysekai_material', 67, -2, 3, 1, 2, 'before_drop', 3, null]]
]] } };
const expected = { 'さいしょの原っぱ': [{
    location: [-2, 3], fixtureId: 8001, reward: { mysekai_material: { 67: 5 } }
}] };
assert.throws(() => parseMapData(standard), /Only compact/);
assert.deepEqual(parseMapData(compact), expected);
for (const content of ['{"Site: 初始空地":[]}', 'Site: 初始空地\n[]', '{', 'null']) {
    assert.equal(processJsonFile(content, 'invalid.json').success, false);
}
let callbackResult;
await handleFileUpload(new File([JSON.stringify(compact)], 'compact.json'), result => {
    callbackResult = result;
});
assert.deepEqual(callbackResult.data, expected);
const malformed = structuredClone(compact);
malformed.updatedResources.userMysekaiHarvestMaps[0][2][0][7] = '2';
assert.throws(() => parseMapData(malformed), /Only compact/);
console.log('Parser OK: compact rows, quantities, statuses, file loading, old formats and invalid rows rejected.');
