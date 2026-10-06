import * as THREE from '../vendor/three/build/three.module.js';

// Tone #7001 is a Unity particle fixture, so it has no exported static GLB.
const glow = new THREE.MeshBasicMaterial({
    color: 0x62fff2, transparent: true, opacity: 0.8,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
});
const halo = glow.clone();
halo.opacity = 0.22;
const wall = new THREE.CylinderGeometry(1.1, 1.1, 0.4, 64, 1, true);
const positions = wall.attributes.position;
for (let i = 0; i < positions.count; i++) {
    const angle = Math.atan2(positions.getZ(i), positions.getX(i));
    const height = positions.getY(i) > 0 ? 0.32 + 0.09 * Math.sin(angle * 13) : 0.04;
    positions.setY(i, height);
}
positions.needsUpdate = true;
wall.computeBoundingBox();
wall.computeBoundingSphere();
const rim = new THREE.RingGeometry(0.96, 1.25, 64);

export function createToneHarvest() {
    const group = new THREE.Group();
    group.name = 'tone-glow';
    group.add(new THREE.Mesh(wall, glow));
    const ground = new THREE.Mesh(rim, halo);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.05;
    group.add(ground);
    return group;
}
