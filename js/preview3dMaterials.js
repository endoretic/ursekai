import * as THREE from 'three';
import { cloudShadow } from './preview3dAtmosphere.js';

// Shared by the water materials; the preview advances it only while visible.
export const waterTime = { value: 0 };

export async function restoreMaterials(gltf) {
    const materials = new Set();
    gltf.scene.traverse(object => {
        if (object.isMesh) [].concat(object.material).forEach(material => materials.add(material));
    });
    const replacements = new Map();
    await Promise.all([...materials].map(async source => {
        const settings = source.userData.preview || {};
        const layers = await Promise.all((settings.overlays || []).map(async layer => {
            const texture = await gltf.parser.getDependency('texture', layer.index);
            texture.colorSpace = THREE.SRGBColorSpace;
            return { ...layer, texture };
        }));
        const material = new THREE.MeshLambertMaterial({
            name: source.name, color: source.color, map: source.map, side: source.side,
            transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest,
            vertexColors: source.vertexColors, depthWrite: !source.transparent
        });
        material.userData.preview = settings;
        material.userData.overlayTextures = layers.map(layer => layer.texture);
        material.defines = { SOURCE_ALPHA: 1, OVERLAY_UV2: 1 };
        const scroll = settings.scroll || [0, 0];
        material.userData.animated = scroll.some(Boolean) || layers.some(layer => layer.scroll.some(Boolean));
        material.onBeforeCompile = shader => {
            shader.uniforms.previewTime = waterTime;
            shader.uniforms.previewScroll = { value: new THREE.Vector2(...scroll) };
            shader.uniforms.cloudMap = cloudShadow.map;
            shader.uniforms.cloudStrength = cloudShadow.strength;
            shader.uniforms.cloudScale = cloudShadow.scale;
            shader.uniforms.cloudOffset = cloudShadow.offset;
            const hasAlpha = material.defines?.SOURCE_ALPHA;
            shader.vertexShader = `varying vec2 previewUv, cloudUv;
                varying float previewAlpha;
                ${hasAlpha ? 'attribute float _source_alpha;' : ''}
                ${material.defines?.OVERLAY_UV2 ? 'attribute vec2 uv1; varying vec2 previewUv2;' : ''}
                ` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
                #include <begin_vertex>
                previewUv = uv;
                cloudUv = (modelMatrix * vec4(position, 1.)).xz;
                previewAlpha = ${hasAlpha ? '_source_alpha' : '1.0'};
                ${material.defines?.OVERLAY_UV2 ? 'previewUv2 = uv1;' : ''}
            `);
            shader.fragmentShader = `uniform float previewTime, cloudStrength, cloudScale;
                uniform sampler2D cloudMap;
                uniform vec2 cloudOffset;
                varying vec2 cloudUv;
                uniform vec2 previewScroll;
                varying vec2 previewUv;
                varying float previewAlpha;
                ${material.defines?.OVERLAY_UV2 ? 'varying vec2 previewUv2;' : ''}
                ` + shader.fragmentShader;
            let blend = '';
            layers.forEach((layer, index) => {
                shader.uniforms[`overlay${index}`] = { value: layer.texture };
                shader.uniforms[`overlayTransform${index}`] = { value: new THREE.Vector4(...layer.scale, ...layer.offset) };
                shader.uniforms[`overlayScroll${index}`] = { value: new THREE.Vector2(...layer.scroll) };
                shader.fragmentShader = `uniform sampler2D overlay${index};
                    uniform vec4 overlayTransform${index}; uniform vec2 overlayScroll${index};
                    ` + shader.fragmentShader;
                // UV0 is the only UV channel on the beach terrain. Preserve UV2 where the model supplies it.
                const uv = layer.uv > 0 && material.defines?.OVERLAY_UV2 ? 'previewUv2' : 'previewUv';
                blend += `vec4 layer${index} = texture2D(overlay${index},
                    ${uv} * overlayTransform${index}.xy + overlayTransform${index}.zw
                    + previewTime * overlayScroll${index});
                    diffuseColor.rgb = mix(diffuseColor.rgb, layer${index}.rgb * diffuse,
                        layer${index}.a * ${layer.vertexAlpha ? 'previewAlpha' : '1.0'});\n`;
            });
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
                THREE.ShaderChunk.map_fragment.replace('vMapUv', '(vMapUv + previewScroll * previewTime)') + '\n' + blend);
            if (settings.vertexOpacity) shader.fragmentShader = shader.fragmentShader.replace(
                '#include <alphatest_fragment>', 'diffuseColor.a *= previewAlpha;\n#include <alphatest_fragment>');
            shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
                outgoingLight *= 1. - texture2D(cloudMap, cloudUv * cloudScale + cloudOffset).r * cloudStrength * .38;
                #include <opaque_fragment>
            `);
        };
        material.customProgramCacheKey = () => JSON.stringify([settings, material.defines]);
        replacements.set(source, material);
    }));
    gltf.scene.traverse(object => {
        if (!object.isMesh) return;
        const convert = source => {
            const material = replacements.get(source);
            const geometry = object.geometry;
            const count = geometry.attributes.position.count;
            if (!geometry.hasAttribute('uv')) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
            if (!geometry.hasAttribute('uv1')) geometry.setAttribute('uv1', geometry.attributes.uv.clone());
            if (!geometry.hasAttribute('_source_alpha')) geometry.setAttribute('_source_alpha', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
            return material;
        };
        object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
        const water = [].concat(object.material).some(material => material.userData.preview.water);
        object.castShadow = !water;
        object.receiveShadow = !water;
    });
    materials.forEach(material => material.dispose());
    return gltf.scene;
}
