import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseMapData } from './dataParser.js';
import { SITE_ID_MAP, getItemName } from './config.js';
import { setItemImage } from './itemImages.js';
import { restoreMaterials, waterTime } from './preview3dMaterials.js';
import { readCaptureWeather } from './preview3dWeather.js';
import { createAtmosphere } from './preview3dAtmosphere.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ASSET_ROOT = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    ? './assets/3d/' : 'https://ursekai-renderer.endoretic.workers.dev/assets/3d/';
const viewport = document.getElementById('viewport');
const loading = document.getElementById('loading');
const status = document.getElementById('status');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a8c6cf');
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1600);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
viewport.append(renderer.domElement);
const labelLayer = document.createElement('div');
labelLayer.className = 'harvest-labels';
viewport.append(labelLayer);
const labels = [];
// Lambert lighting divides irradiance by PI; keep the source colors at their intended brightness.
const sun = new THREE.DirectionalLight(0xffffff, Math.PI);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 240 });
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.03;
const ambient = new THREE.AmbientLight(0xffffff, Math.PI);
scene.add(sun, sun.target, ambient);
const controls = new OrbitControls(camera, renderer.domElement);
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.screenSpacePanning = false;
controls.zoomToCursor = true;
controls.rotateSpeed = 0.55;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 4;
controls.maxDistance = 220;
controls.enableDamping = false;
controls.listenToKeyEvents(viewport);
const loader = new GLTFLoader();
const templates = new Map();
const raycaster = new THREE.Raycaster();
const harvest = new THREE.Group();
scene.add(harvest);
let terrain;
let manifest;
let atmosphere;
let siteId = '5';
let mapData = {};
let captureWeather = null;
let hasJson = false;
let loadId = 0;
let placementId = 0;
let focus = new THREE.Vector3();
let treeHeight = 7;
let viewDistance = 14;
let pointerStart;
let animationFrame;
let lastAnimationFrame = 0;
let hasWaterMotion = false;

function render(updateLabels = true) {
    renderer.render(scene, camera);
    if (updateLabels) positionLabels();
}
controls.addEventListener('change', () => {
    atmosphere?.update(0, controls.target);
    render();
});
new ResizeObserver(() => {
    const { width, height } = viewport.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    render();
}).observe(viewport);

function resetCamera(top = false) {
    controls.target.copy(focus);
    camera.position.copy(focus).add(top
        ? new THREE.Vector3(0, viewDistance * 1.5, 0.01)
        : new THREE.Vector3(viewDistance * 0.35, viewDistance, viewDistance * 0.8));
    controls.update();
    viewport.dataset.cameraHeight = (camera.position.y - focus.y).toFixed(2);
    viewport.dataset.treeHeight = treeHeight.toFixed(2);
    render();
}

function animateEnvironment(time) {
    animationFrame = requestAnimationFrame(animateEnvironment);
    if (time - lastAnimationFrame < 50) return; // Atmosphere is capped at 20 fps; input redraws immediately.
    const elapsed = Math.min((time - lastAnimationFrame) / 1000, 0.1);
    lastAnimationFrame = time;
    if (document.getElementById('waterMotion').checked) waterTime.value += elapsed;
    atmosphere?.update(elapsed, controls.target);
    render(false);
}

function updateAnimation() {
    cancelAnimationFrame(animationFrame);
    lastAnimationFrame = performance.now();
    if (!document.hidden && (atmosphere?.animated || hasWaterMotion && document.getElementById('waterMotion').checked)) {
        animationFrame = requestAnimationFrame(animateEnvironment);
    }
}

async function applyWeather() {
    if (!atmosphere) return; // A JSON selected during startup is applied after weather assets load.
    const weather = captureWeather?.preset || 'sunny';
    const raining = captureWeather?.rain || false;
    const palette = await atmosphere.select(captureWeather?.id ?? 1);
    if (!palette) return; // A newer JSON load superseded this weather selection.
    const light = palette.light;
    if (!light) return;
    const color = light.phenomenaDirectionalLightColor;
    const shade = light.phenomenaShadeColor;
    // Shade is the unlit baseline, so direct light supplies only the remaining energy.
    // Adding a full-strength sun on top of that baseline washes out the source palette.
    sun.color.setRGB(color.r * (1 - shade.r), color.g * (1 - shade.g), color.b * (1 - shade.b));
    ambient.color.setRGB(color.r * shade.r, color.g * shade.g, color.b * shade.b);
    const elevation = THREE.MathUtils.degToRad(light.angleY);
    const azimuth = THREE.MathUtils.degToRad(light.angleXZ);
    sun.position.set(-Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(100);
    const sky = new THREE.Color({ sunny: '#a8c6cf', rain: '#7e909c', evening: '#c99a88', night: '#222d4a' }[weather]);
    scene.background = sky;
    const weatherId = captureWeather?.id;
    if (weatherId === 16) sky.set('#52aecb');
    if ([10, 11].includes(weatherId)) sky.set(weatherId === 10 ? '#b9d8e7' : '#6c7ea9');
    scene.fog = new THREE.FogExp2(sky, raining || weatherId === 16 ? 0.012 : [10, 11, 15].includes(weatherId) ? 0.008 : 0.003);
    viewport.dataset.weather = weather;
    viewport.dataset.phenomena = captureWeather?.id ?? '';
    const recorded = captureWeather ? `JSON: ${captureWeather.name} (#${captureWeather.id})` :
        hasJson ? 'No weather metadata in this JSON' : 'Load JSON to read its weather';
    document.getElementById('weatherHint').textContent = recorded + (captureWeather
        ? palette.supported ? ' · JP palette and textures; lightweight effects.' : ' · Unknown weather; default lighting.'
        : ' · Default lighting.');
    renderer.shadowMap.needsUpdate = true;
    atmosphere.update(0, controls.target);
    updateAnimation();
    render();
}

function positionLabels() {
    const show = document.getElementById('showDrops').checked;
    const width = viewport.clientWidth, height = viewport.clientHeight;
    for (const label of labels) {
        const position = label.anchor.clone().project(camera);
        const visible = show && position.z > -1 && position.z < 1 && Math.abs(position.x) < 1.1 && Math.abs(position.y) < 1.1;
        label.element.hidden = !visible;
        if (!visible) continue;
        const distance = camera.position.distanceTo(label.anchor);
        const scale = THREE.MathUtils.clamp(viewDistance * 1.6 / distance, 0.72, 1);
        label.element.style.transform = `translate(${(position.x + 1) * width / 2}px, ${(1 - position.y) * height / 2}px) translate(-50%, -100%) scale(${scale})`;
        label.element.style.zIndex = Math.max(1, Math.round(1000 - distance));
    }
}

function clearHarvest() {
    harvest.clear();
    labels.length = 0;
    labelLayer.replaceChildren();
}

function rewardRows(point, compact = false) {
    const rows = [];
    for (const [category, items] of Object.entries(point.reward)) {
        for (const [id, quantity] of Object.entries(items)) {
            const row = document.createElement('span');
            row.className = compact ? 'drop-item' : 'reward';
            const image = document.createElement('img');
            setItemImage(image, category, id);
            const count = document.createElement('strong');
            count.textContent = `×${quantity}`;
            row.append(image);
            if (!compact) {
                const name = document.createElement('span');
                name.textContent = getItemName(category, id);
                row.append(name);
            }
            row.append(count);
            rows.push(row);
        }
    }
    return rows;
}

function selectHarvest(point) {
    document.getElementById('selectionHint').textContent = `Harvest #${point.fixtureId} · (${point.location.join(', ')})`;
    document.getElementById('rewards').replaceChildren(...rewardRows(point));
    labels.forEach(label => label.element.classList.toggle('selected', label.point === point));
}

function disposeTerrain(model) {
    if (!model) return;
    const textures = new Set();
    const materials = new Set();
    const geometries = new Set();
    model.traverse(object => {
        if (!object.isMesh) return;
        geometries.add(object.geometry);
        for (const material of [].concat(object.material)) {
            materials.add(material);
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
            material.userData.overlayTextures?.forEach(texture => textures.add(texture));
        }
    });
    textures.forEach(texture => { texture.source.data?.close?.(); texture.dispose(); });
    materials.forEach(material => material.dispose());
    geometries.forEach(geometry => geometry.dispose());
}

function clearSelection() {
    document.getElementById('selectionHint').textContent = 'Select a harvest object to see its drops.';
    document.getElementById('rewards').replaceChildren();
}

function isGround(object) {
    let path = '';
    for (let parent = object; parent; parent = parent.parent) path += '/' + parent.name.toLowerCase();
    return /ground|bridge|step|floor|island/.test(path) && !/sea|waterfall|tree|shrub/.test(path);
}

function groundMeshes() {
    const result = [];
    terrain.traverse(object => { if (object.isMesh && isGround(object)) result.push(object); });
    return result;
}

function batchTerrain(model) {
    model.updateMatrixWorld(true);
    const groups = new Map();
    const originals = new Set();
    model.traverse(object => {
        if (!object.isMesh) return;
        const ground = isGround(object);
        const key = [object.material.uuid, ground, Object.keys(object.geometry.attributes).sort().join(',')].join(':');
        if (!groups.has(key)) groups.set(key, { material: object.material, ground, geometries: [] });
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        if (object.matrixWorld.determinant() < 0 && geometry.index) {
            const indices = geometry.index.array;
            for (let i = 0; i < indices.length; i += 3) [indices[i], indices[i + 2]] = [indices[i + 2], indices[i]];
        }
        groups.get(key).geometries.push(geometry);
        originals.add(object.geometry);
    });
    const result = new THREE.Group();
    for (const { material, ground, geometries } of groups.values()) {
        const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
        mesh.name = ground ? 'ground' : material.name;
        mesh.castShadow = !material.userData.preview.water;
        mesh.receiveShadow = !material.userData.preview.water;
        result.add(mesh);
        geometries.forEach(geometry => geometry.dispose());
    }
    originals.forEach(geometry => geometry.dispose());
    return result;
}

async function placeHarvest(ticket) {
    const placement = ++placementId;
    const points = mapData[SITE_ID_MAP[siteId]] || [];
    const pending = [...new Set(points.map(point => manifest.fixtures[point.fixtureId]).filter(Boolean))];
    const models = await Promise.all(pending.map(file => {
        if (!templates.has(file)) {
            const promise = loader.loadAsync(ASSET_ROOT + 'models/' + file).then(restoreMaterials)
                .catch(error => { templates.delete(file); throw error; });
            templates.set(file, promise);
        }
        return templates.get(file);
    }));
    if (ticket !== loadId || placement !== placementId) return;
    const loaded = new Map(pending.map((file, index) => [file, models[index]]));
    clearHarvest();
    terrain.updateMatrixWorld(true);
    const ground = groundMeshes();
    const missing = [];
    for (const point of points) {
        const file = manifest.fixtures[point.fixtureId];
        if (!file) { missing.push(point.fixtureId); continue; }
        const object = loaded.get(file).clone(true);
        const [x, z] = point.location;
        raycaster.set(new THREE.Vector3(-x, 300, z), new THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObjects(ground, false)[0];
        const placement = new THREE.Group();
        placement.position.set(-x, hit?.point.y || 0, z);
        placement.userData.point = point;
        placement.name = `harvest-${point.fixtureId}`;
        placement.add(object);
        harvest.add(placement);
        const element = document.createElement('button');
        element.className = 'harvest-label';
        element.append(...rewardRows(point, true));
        element.setAttribute('aria-label', `Harvest ${point.fixtureId} at ${point.location.join(', ')}`);
        element.addEventListener('pointerdown', event => event.stopPropagation());
        element.addEventListener('click', () => selectHarvest(point));
        labelLayer.append(element);
        const bounds = new THREE.Box3().setFromObject(placement);
        labels.push({ element, point, anchor: new THREE.Vector3(-x, bounds.max.y + 0.65, z) });
    }
    status.textContent = points.length ? `${harvest.children.length} harvest objects${missing.length
        ? ` · Missing models: ${[...new Set(missing)].join(', ')}` : ''}` : 'Scene ready · Load JSON to show harvest objects';
    viewport.dataset.harvestCount = harvest.children.length;
    viewport.dataset.missingModels = [...new Set(missing)].join(',');
    loading.hidden = true;
    renderer.shadowMap.needsUpdate = true;
    render();
}

async function selectMap(nextSite) {
    const ticket = ++loadId;
    siteId = nextSite;
    loading.hidden = false;
    loading.textContent = 'Loading local scene…';
    status.textContent = 'Loading scene';
    clearSelection();
    clearHarvest();
    hasWaterMotion = false;
    updateAnimation();
    document.querySelectorAll('[data-site]').forEach(button => {
        const active = button.dataset.site === siteId;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('mapTitle').textContent = SITE_ID_MAP[siteId];
    document.getElementById('fieldNumber').textContent = String(Number(siteId) - 4).padStart(2, '0');
    if (terrain) { scene.remove(terrain); disposeTerrain(terrain); terrain = null; }
    render();
    try {
        const gltf = await loader.loadAsync(ASSET_ROOT + 'models/' + manifest.scenes[siteId]);
        if (ticket !== loadId) { disposeTerrain(gltf.scene); return; }
        const restored = await restoreMaterials(gltf);
        if (ticket !== loadId) { disposeTerrain(restored); return; }
        terrain = batchTerrain(restored);
        scene.add(terrain);
        terrain.updateMatrixWorld(true);
        focus.set(0, 0, 0);
        raycaster.set(new THREE.Vector3(0, 300, 0), new THREE.Vector3(0, -1, 0));
        focus.y = raycaster.intersectObjects(groundMeshes(), false)[0]?.point.y || 0;
        terrain.traverse(object => {
            if (object.isMesh && [].concat(object.material).some(material => material.userData.animated)) hasWaterMotion = true;
        });
        viewDistance = treeHeight * 2;
        renderer.shadowMap.needsUpdate = true;
        resetCamera();
        viewport.dataset.site = siteId;
        updateAnimation();
        await placeHarvest(ticket);
    } catch (error) {
        if (ticket !== loadId) return;
        loading.textContent = `Could not load models: ${error.message}`;
        status.textContent = 'Model loading failed';
    }
}

async function loadJson(data) {
    const parsed = parseMapData(data);
    if (!Object.keys(parsed).length) throw new Error('No map data found');
    mapData = parsed;
    captureWeather = readCaptureWeather(data);
    hasJson = true;
    await applyWeather();
    if (!terrain) return;
    loading.hidden = false;
    loading.textContent = 'Placing harvest objects…';
    clearSelection();
    await placeHarvest(loadId);
}

async function importJson(read) {
    try { await loadJson(await read()); }
    catch (error) { loading.hidden = false; loading.textContent = `Could not load JSON: ${error.message}`; }
}

const jsonFile = document.getElementById('jsonFile');
document.getElementById('loadJson').addEventListener('click', () => jsonFile.click());
jsonFile.addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) importJson(async () => JSON.parse(await file.text()));
    event.target.value = '';
});
document.getElementById('resetView').addEventListener('click', () => resetCamera());
document.getElementById('topView').addEventListener('click', () => resetCamera(true));
document.getElementById('showDrops').addEventListener('change', positionLabels);
document.getElementById('waterMotion').addEventListener('change', updateAnimation);
document.addEventListener('visibilitychange', updateAnimation);
document.querySelectorAll('[data-site]').forEach(button => button.addEventListener('click', () => {
    if (manifest) selectMap(button.dataset.site);
}));
viewport.addEventListener('contextmenu', event => event.preventDefault());
viewport.addEventListener('pointerdown', event => {
    viewport.focus({ preventScroll: true });
    pointerStart = [event.clientX, event.clientY];
});
viewport.addEventListener('pointerup', event => {
    if (event.button !== 0 || !pointerStart || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5) return;
    const bounds = viewport.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1,
        -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera);
    let object = raycaster.intersectObjects(harvest.children, true)[0]?.object;
    while (object && !object.userData.point) object = object.parent;
    if (!object) return;
    selectHarvest(object.userData.point);
});

try {
    const response = await fetch(ASSET_ROOT + 'models/manifest.json');
    if (!response.ok) throw new Error('Scene assets are unavailable');
    manifest = await response.json();
    atmosphere = await createAtmosphere(scene, camera, sun, ASSET_ROOT + 'weather/');
    await applyWeather();
    const referenceTree = await loader.loadAsync(ASSET_ROOT + 'models/' + manifest.fixtures['1001']);
    treeHeight = new THREE.Box3().setFromObject(referenceTree.scene).getSize(new THREE.Vector3()).y;
    disposeTerrain(referenceTree.scene);
    await selectMap(siteId);
} catch (error) {
    loading.textContent = `3D view unavailable: ${error.message}`;
}
