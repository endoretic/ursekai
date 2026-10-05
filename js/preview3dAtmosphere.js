import * as THREE from 'three';

// Shared by terrain materials; cloud shadows move without redrawing the shadow map.
export const cloudShadow = {
    map: { value: null }, strength: { value: 0 }, scale: { value: 0.01 },
    offset: { value: new THREE.Vector2() }
};
const PARTICLE_LIMIT = 320;
const SPAN = 20;
const HEIGHT = 12;
const wrap = (value, range) => ((value % range) + range) % range;
const fraction = value => value - Math.floor(value);
const SEEDS = Array.from({ length: PARTICLE_LIMIT }, (_, i) =>
    [17.17, 7.13, 3.71].map((factor, axis) => fraction(Math.sin(i * factor + axis + 1) * 43758.5453)));
const MODES = {
    3: ['star', 70, 0.18], 5: ['star', 90, 0.2],
    9: ['star', 100, 0.2], 10: ['snow', 320, 0.18], 11: ['snow', 320, 0.2],
    12: ['bubble', 80, 0.65], 13: ['star', 120, 0.25],
    14: ['note', 64, 0.45], 16: ['waterBubble', 56, 0.32], 17: ['star', 40, 0.15]
};

export async function createAtmosphere(scene, camera, sun, root) {
    const response = await fetch(root + 'weather.json');
    if (!response.ok) throw new Error('Export the JP weather assets first');
    const source = await response.json();
    const loader = new THREE.TextureLoader();
    const textures = new Map();
    function texture(file, color = true) {
        const key = `${file}:${color}`;
        if (!textures.has(key)) textures.set(key, loader.loadAsync(root + file).then(map => {
            map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            map.wrapS = map.wrapT = THREE.RepeatWrapping;
            return map;
        }).catch(error => { textures.delete(key); throw error; }));
        return textures.get(key);
    }
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: { ramp: { value: null }, cloudMap: cloudShadow.map, cloudOffset: cloudShadow.offset,
            cloudAmount: cloudShadow.strength, night: { value: 0 } },
        vertexShader: `varying vec3 direction;
            void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform sampler2D ramp, cloudMap; uniform vec2 cloudOffset;
            uniform float cloudAmount, night; varying vec3 direction;
            void main() {
                vec3 ray = normalize(direction);
                float height = max(ray.y, 0.);
                vec3 color = texture2D(ramp, vec2(clamp(1. - height * 1.25, .016, .984), .5)).rgb;
                vec2 uv = ray.xz / (height + .25) * .25 + cloudOffset;
                float cloud = smoothstep(.35, .9, texture2D(cloudMap, uv).r);
                color = mix(color, mix(vec3(.9), color * 1.4, night), cloud * cloudAmount * .7);
                gl_FragColor = vec4(color, 1.);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }`
    }));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    sky.visible = false;
    sky.onBeforeRender = () => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
    scene.add(sky);

    const positions = new Float32Array(PARTICLE_LIMIT * 3);
    const colors = new Float32Array(PARTICLE_LIMIT * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
        transparent: true, depthWrite: false, vertexColors: true, alphaTest: 0.01
    }));
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    const streakPositions = new Float32Array(PARTICLE_LIMIT * 6);
    const streakColors = new Float32Array(PARTICLE_LIMIT * 6);
    const streakGeometry = new THREE.BufferGeometry();
    streakGeometry.setAttribute('position', new THREE.BufferAttribute(streakPositions, 3).setUsage(THREE.DynamicDrawUsage));
    streakGeometry.setAttribute('color', new THREE.BufferAttribute(streakColors, 3).setUsage(THREE.DynamicDrawUsage));
    const streaks = new THREE.LineSegments(streakGeometry, new THREE.LineBasicMaterial({
        transparent: true, opacity: 0.45, depthWrite: false, vertexColors: true, blending: THREE.AdditiveBlending
    }));
    streaks.visible = false;
    streaks.frustumCulled = false;
    scene.add(streaks);

    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    moon.scale.set(32, 32, 1);
    moon.visible = false;
    scene.add(moon);
    const galaxy = new THREE.Mesh(new THREE.SphereGeometry(580, 32, 16), new THREE.MeshBasicMaterial({
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    galaxy.renderOrder = -9;
    galaxy.rotation.z = 0.6;
    galaxy.visible = false;
    galaxy.onBeforeRender = () => { galaxy.position.copy(camera.position); galaxy.updateMatrixWorld(); };
    scene.add(galaxy);
    const rainbowGeometry = new THREE.RingGeometry(38, 42, 80, 1, 0, Math.PI);
    const vertices = rainbowGeometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
        const radius = Math.hypot(vertices.getX(i), vertices.getY(i));
        rainbowGeometry.attributes.uv.setXY(i, 0.5, THREE.MathUtils.clamp((radius - 38) / 4, 0.01, 0.99));
    }
    const rainbow = new THREE.Mesh(rainbowGeometry, new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, fog: false
    }));
    rainbow.visible = false;
    scene.add(rainbow);

    let id = 1, palette, mode, elapsed = 0, selection = 0;
    async function select(nextId) {
        const ticket = ++selection;
        const next = source.weather[nextId] || source.weather[1];
        const nextMode = MODES[nextId];
        const [ramp, clouds, particleMap, moonMap, galaxyMap, rainbowMap] = await Promise.all([
            texture(next.ramp), next.cloud.texture ? texture(next.cloud.texture, false) : null,
            nextMode ? texture(source.sprites[nextMode[0]]) : null,
            nextId === 5 ? texture(source.sprites.moon) : null,
            [9, 13, 14].includes(nextId) ? texture(source.sprites[nextId === 9 ? 'milkyway' : 'nebula']) : null,
            nextId === 17 ? texture(source.sprites.rainbow) : null
        ]);
        if (ticket !== selection) return null;
        id = nextId; palette = next; mode = nextMode; elapsed = 0;
        cloudShadow.map.value = clouds;
        cloudShadow.strength.value = clouds ? next.cloud.opacity : 0;
        cloudShadow.scale.value = next.cloud.size / 24;
        cloudShadow.offset.value.set(0, 0);
        sky.material.uniforms.ramp.value = ramp;
        sky.material.uniforms.night.value = [3, 5, 7, 8, 9, 11, 13].includes(id) ? 1 : 0;
        sky.visible = true;
        points.visible = Boolean(mode);
        if (mode) {
            geometry.setDrawRange(0, mode[1]);
            points.material.map = particleMap;
            points.material.size = mode[2];
            points.material.blending = mode[0] === 'star' ? THREE.AdditiveBlending : THREE.NormalBlending;
            points.material.needsUpdate = true;
        }
        streaks.visible = [6, 7, 8, 9].includes(id);
        streakGeometry.setDrawRange(0, (id === 9 ? 8 : PARTICLE_LIMIT) * 2);
        streaks.material.opacity = id === 9 ? 0.85 : 0.38;
        moon.visible = id === 5;
        if (moonMap) { moon.material.map = moonMap; moon.material.needsUpdate = true; }
        galaxy.visible = Boolean(galaxyMap);
        if (galaxyMap) { galaxy.material.map = galaxyMap; galaxy.material.color.set(id === 9 ? '#9380dd' : '#62bfe6'); galaxy.material.needsUpdate = true; }
        rainbow.visible = id === 17;
        if (rainbowMap) { rainbow.material.map = rainbowMap; rainbow.material.needsUpdate = true; }
        sun.intensity = Math.PI;
        return { ...next, supported: Boolean(source.weather[nextId]) };
    }
    function update(delta, target) {
        if (!palette) return;
        elapsed += delta;
        const cloud = palette.cloud;
        cloudShadow.offset.value.set(cloud.direction[0], cloud.direction[1]).multiplyScalar(elapsed * cloud.speed * 0.006);
        points.position.set(camera.position.x, Math.max(target.y, camera.position.y - HEIGHT * 0.65), camera.position.z);
        streaks.position.copy(points.position);
        moon.position.copy(camera.position).add(new THREE.Vector3(-85, 55, -220));
        rainbow.position.set(target.x - 75, target.y - 3, target.z - 180);
        if (mode) for (let i = 0; i < mode[1]; i++) {
            const [sx, phase, sz] = SEEDS[i], seed = i * 2.39996;
            const falling = mode[0] === 'snow';
            const speed = falling ? -1.6 : mode[0] === 'star' ? 0.15 : 0.6;
            const y = wrap(phase * HEIGHT + elapsed * speed, HEIGHT);
            positions.set([
                wrap(sx * SPAN - camera.position.x
                    + Math.sin(elapsed * 0.5 + seed) * (falling ? 1.2 : 0.4), SPAN) - SPAN / 2,
                y, wrap(sz * SPAN - camera.position.z, SPAN) - SPAN / 2
            ], i * 3);
            const fade = Math.min(y, HEIGHT - y, 1) * (mode[0] === 'star' ? 0.6 + Math.sin(elapsed * 1.5 + seed) * 0.4 : 1);
            colors.set([1, 1, 1, fade], i * 4);
        }
        if (points.visible) {
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.color.needsUpdate = true;
        }
        if (streaks.visible) for (let i = 0; i < (id === 9 ? 8 : PARTICLE_LIMIT); i++) {
            const [sx, phase, sz] = SEEDS[i];
            const meteor = id === 9;
            const age = wrap(elapsed * (meteor ? 0.2 : 0.75) + phase, 1);
            const x = wrap(sx * SPAN - camera.position.x, SPAN) - SPAN / 2 + (meteor ? age * 12 : 0);
            const y = (1 - age) * HEIGHT;
            const z = wrap(sz * SPAN - camera.position.z, SPAN) - SPAN / 2;
            streakPositions.set([x, y, z, x - (meteor ? 3.5 : 0.06), y + (meteor ? 4 : 0.7), z], i * 6);
            const fade = meteor ? Math.sin(age * Math.PI) : 0.8;
            streakColors.set([fade * 0.8, fade * 0.9, fade, 0, 0, 0], i * 6);
        }
        if (streaks.visible) {
            streakGeometry.attributes.position.needsUpdate = true;
            streakGeometry.attributes.color.needsUpdate = true;
        }
        // One gentle, brief light pulse per 11 seconds; no full-screen strobe or extra shadow pass.
        const flash = id === 8 ? Math.pow(Math.max(0, Math.sin(wrap(elapsed, 11) / 0.8 * Math.PI)), 4) : 0;
        sun.intensity = Math.PI * (1 + (wrap(elapsed, 11) < 0.8 ? flash * 0.3 : 0));
    }
    return { select, update, get animated() { return Boolean(palette && (points.visible || streaks.visible || cloudShadow.strength.value)); } };
}
