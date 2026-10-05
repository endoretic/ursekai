"""Export already-unpacked UnityFS scene bundles to local GLB previews (requires UnityPy).

No network, credentials or game API decryption. Assets stay under ignored testdata/.
"""
import argparse
from array import array
from io import BytesIO
import json
from pathlib import Path
import struct

import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler


def pointer_key(pointer):
    reader = pointer.deref()
    return (reader.assets_file.name, reader.path_id)


class GlbExport:
    def __init__(self):
        self.doc = {
            'asset': {'version': '2.0', 'generator': 'ursekai local UnityFS preview'},
            'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [],
            'textures': [], 'images': [], 'accessors': [], 'bufferViews': [],
            'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
            'extensionsUsed': ['KHR_materials_unlit', 'KHR_texture_transform'],
        }
        self.binary = bytearray()
        self.materials = {}
        self.textures = {}
        self.meshes = {}
        self.vertex_colors = set()

    def texture_info(self, texture):
        return {'index': self.texture(texture.m_Texture),
                'scale': [texture.m_Scale.x, texture.m_Scale.y],
                'offset': [texture.m_Offset.x, 1 - texture.m_Offset.y - texture.m_Scale.y]}

    def view(self, content):
        self.binary.extend(b'\0' * (-len(self.binary) % 4))
        index = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': len(content)})
        self.binary.extend(content)
        return index

    def accessor(self, values, width, integer=False, bounds=False):
        flat = [part for row in values for part in row] if width > 1 else values
        content = array('I' if integer else 'f', flat).tobytes()
        item = {'bufferView': self.view(content), 'componentType': 5125 if integer else 5126,
                'count': len(flat) // width, 'type': {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[width]}
        if bounds:
            item['min'] = [min(row[i] for row in values) for i in range(width)]
            item['max'] = [max(row[i] for row in values) for i in range(width)]
        index = len(self.doc['accessors'])
        self.doc['accessors'].append(item)
        return index

    def texture(self, pointer):
        key = pointer_key(pointer)
        if key not in self.textures:
            texture = pointer.read()
            image = texture.image.convert('RGBA')
            output = BytesIO()
            image.save(output, format='PNG')
            index = len(self.doc['images'])
            self.doc['images'].append({'name': texture.m_Name, 'mimeType': 'image/png',
                                      'bufferView': self.view(output.getvalue())})
            self.doc['textures'].append({'source': index, 'sampler': 0})
            self.textures[key] = index
        return self.textures[key]

    def material(self, pointer):
        key = pointer_key(pointer)
        if key in self.materials:
            return self.materials[key]
        source = pointer.read()
        properties = source.m_SavedProperties
        floats = dict(properties.m_Floats)
        if floats.get('_UseVertexColorBlend'):
            self.vertex_colors.add(key)
        colors = dict(properties.m_Colors)
        color = colors.get('_Color') or colors.get('_BaseColor')
        factor = [max(0, min(1, getattr(color, channel))) for channel in 'rgba'] if color else [1, 1, 1, 1]
        textures = dict(properties.m_TexEnvs)
        texture = next((textures[k] for k in ('_MainTex', '_BaseMap', '_BaseColorMap')
                        if k in textures and textures[k].m_Texture.path_id), None)
        transparent = floats.get('_DstBlend') == 10 or floats.get('_UseVertexAlphaOpacity') == 1
        opacity = floats.get('_BaseOpacity', 1)
        factor[3] *= opacity
        result = {'name': source.m_Name, 'doubleSided': floats.get('_Cull', 0) == 0,
                  'alphaMode': 'BLEND' if transparent else 'MASK' if floats.get('_UseAlphaClip') else 'OPAQUE',
                  'alphaCutoff': floats.get('_AlphaClip', floats.get('_Cutoff', 0.5)),
                  'extensions': {'KHR_materials_unlit': {}},
                  'pbrMetallicRoughness': {'baseColorFactor': factor, 'metallicFactor': 0, 'roughnessFactor': 1}}
        preview = {'vertexOpacity': bool(floats.get('_UseVertexAlphaOpacity')),
                   'scroll': [floats.get('_UVScrollX', 0), -floats.get('_UVScrollY', 0)],
                   'water': 'water' in source.m_Name.lower() or 'sea' in source.m_Name.lower(),
                   'overlays': []}
        for suffix, coordinate in (('', '1st'), ('2nd', '2nd')):
            overlay = textures.get('_OverlayColorMap' + suffix)
            if not floats.get('_UseOverlayTexture' + suffix) or not overlay or not overlay.m_Texture.path_id:
                continue
            layer = self.texture_info(overlay)
            layer.update({'vertexAlpha': bool(floats.get('_UseOverlayTextureVertexAlpha' + suffix)),
                          'uv': int(floats.get('_TextureCoord_Overlay' + coordinate, 0)),
                          'scroll': [floats.get('_UVScrollX_Overlay' + coordinate, 0),
                                     -floats.get('_UVScrollY_Overlay' + coordinate, 0)]})
            preview['overlays'].append(layer)
        preview['shading'] = {key: floats[key] for key in ('_OverrideShadingParameter', '_LocalShadingIntensity',
                                                          '_LocalEdgeThreshold', '_LocalEdgeSmoothness') if key in floats}
        result['extras'] = {'preview': preview}
        if texture:
            result['pbrMetallicRoughness']['baseColorTexture'] = {
                'index': self.texture(texture.m_Texture),
                'extensions': {'KHR_texture_transform': {
                    'offset': [texture.m_Offset.x, 1 - texture.m_Offset.y - texture.m_Scale.y],
                    'scale': [texture.m_Scale.x, texture.m_Scale.y]}}
            }
        elif any(word in source.m_Name.lower() for word in ('water', 'sea', 'river')):
            # Static water color only; Unity's animated water shader is not part of this preview.
            result['pbrMetallicRoughness']['baseColorFactor'] = [0.23, 0.65, 0.71, 0.8]
            result['alphaMode'] = 'BLEND'
        index = len(self.doc['materials'])
        self.doc['materials'].append(result)
        self.materials[key] = index
        return index

    def mesh(self, pointer, materials):
        key = (pointer_key(pointer), tuple(pointer_key(p) for p in materials if p.path_id))
        if key in self.meshes:
            return self.meshes[key]
        source = pointer.read()
        mesh = MeshHandler(source)
        mesh.process()
        if not mesh.m_Vertices:
            return None
        attributes = {'POSITION': self.accessor([[-v[0], v[1], v[2]] for v in mesh.m_Vertices], 3, bounds=True)}
        if mesh.m_Normals:
            attributes['NORMAL'] = self.accessor([[-v[0], v[1], v[2]] for v in mesh.m_Normals], 3)
        if mesh.m_UV0:
            attributes['TEXCOORD_0'] = self.accessor([[v[0], 1 - v[1]] for v in mesh.m_UV0], 2)
        if mesh.m_UV1:
            attributes['TEXCOORD_1'] = self.accessor([[v[0], 1 - v[1]] for v in mesh.m_UV1], 2)
        if mesh.m_Colors:
            divisor = 255 if max(max(c) for c in mesh.m_Colors) > 1 else 1
            attributes['_SOURCE_ALPHA'] = self.accessor([c[3] / divisor for c in mesh.m_Colors], 1)
        color_accessor = None
        primitives = []
        for i, triangles in enumerate(mesh.get_triangles()):
            indices = [index for a, b, c in triangles for index in (c, b, a)]
            if not indices:
                continue
            primitive = {'attributes': dict(attributes), 'indices': self.accessor(indices, 1, integer=True)}
            if materials and materials[min(i, len(materials) - 1)].path_id:
                material = materials[min(i, len(materials) - 1)]
                primitive['material'] = self.material(material)
                if mesh.m_Colors and pointer_key(material) in self.vertex_colors:
                    if color_accessor is None:
                        divisor = 255 if max(max(c) for c in mesh.m_Colors) > 1 else 1
                        color_accessor = self.accessor([[v / divisor for v in c[:3]] for c in mesh.m_Colors], 3)
                    primitive['attributes']['COLOR_0'] = color_accessor
            primitives.append(primitive)
        index = len(self.doc['meshes'])
        self.doc['meshes'].append({'name': source.m_Name, 'primitives': primitives})
        self.meshes[key] = index
        return index

    def node(self, game_object, root=False):
        source = game_object.read()
        if not source.m_IsActive and not root:
            return None
        # Particle meshes, navmesh and collision-only helpers need Unity shaders/scripts, not static geometry.
        if source.m_Name.lower().startswith(('fx_', 'collider', 'navmesh', 'sound_mesh')):
            return None
        components = {pair.component.type.name: pair.component.read() for pair in source.m_Component
                      if pair.component.type.name in ('Transform', 'MeshFilter', 'MeshRenderer', 'SkinnedMeshRenderer')}
        transform = components.get('Transform')
        if not transform:
            return None
        position, rotation, scale = transform.m_LocalPosition, transform.m_LocalRotation, transform.m_LocalScale
        node = {'name': source.m_Name, 'translation': [-position.x, position.y, position.z],
                'rotation': [rotation.x, -rotation.y, -rotation.z, rotation.w],
                'scale': [scale.x, scale.y, scale.z]}
        children = []
        before_object = None
        for pair in source.m_Component:
            if pair.component.type.name == 'MonoBehaviour':
                before = pair.component.read_typetree().get('woodBeforeObject')
                if before and before['m_PathID']:
                    before_object = (pair.component.deref().assets_file.name, before['m_PathID'])
        for child in transform.m_Children:
            child_object = child.read().m_GameObject
            # The tree prefab also contains the cut tree and stump; show only its standing state.
            if before_object and pointer_key(child_object) != before_object:
                continue
            index = self.node(child_object)
            if index is not None:
                children.append(index)
        if children:
            node['children'] = children
        renderer = components.get('MeshRenderer') or components.get('SkinnedMeshRenderer')
        mesh_filter = components.get('MeshFilter') or components.get('SkinnedMeshRenderer')
        if renderer and renderer.m_Enabled and mesh_filter and mesh_filter.m_Mesh.path_id:
            index = self.mesh(mesh_filter.m_Mesh, renderer.m_Materials)
            if index is not None:
                node['mesh'] = index
        if not children and 'mesh' not in node:
            return None
        index = len(self.doc['nodes'])
        self.doc['nodes'].append(node)
        return index

    def save(self, game_object, path):
        root = self.node(game_object, root=True)
        if root is None:
            return False
        self.doc['scenes'][0]['nodes'] = [root]
        self.binary.extend(b'\0' * (-len(self.binary) % 4))
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        document = json.dumps(self.doc, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf8')
        document += b' ' * (-len(document) % 4)
        content = (struct.pack('<4sII', b'glTF', 2, 28 + len(document) + len(self.binary))
                   + struct.pack('<I4s', len(document), b'JSON') + document
                   + struct.pack('<I4s', len(self.binary), b'BIN\0') + self.binary)
        path.write_bytes(content)
        print(f'{path.name}: {len(self.doc["meshes"])} meshes, {len(self.doc["nodes"])} nodes, {len(content)/1024**2:.1f} MiB', flush=True)
        return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundles', type=Path)
    parser.add_argument('master', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    UnityPy.config.FALLBACK_UNITY_VERSION = '2022.3.21f1'
    env = UnityPy.load(*[str(p) for p in args.bundles.rglob('*') if p.is_file() and p.suffix != '.sha'])
    args.output.mkdir(parents=True, exist_ok=True)
    prefabs = {key.lower(): obj for key, obj in env.container.items() if key.endswith('.prefab')}
    base = 'assets/sekai/assetbundle/resources/ondemand/mysekai/site/field/'
    scenes = {'5': 'grasslands', '6': 'beach', '7': 'flowergarden', '8': 'memorialplace'}
    manifest = {'region': 'cn', 'coordinateSystem': 'Unity mirrored X', 'scenes': {}, 'fixtures': {}}
    manifest['weather'] = {}
    weather_names = {'env_001_sunny': 'sunny', 'env_006_rain': 'rain',
                     'env_evening': 'evening', 'env_003_night': 'night'}
    # Retain the scene's basic environment metadata; the standalone weather exporter supplies JP palettes.
    for obj in env.objects:
        if obj.type.name == 'MonoBehaviour':
            data = obj.read_typetree()
            weather = weather_names.get(data.get('m_Name'))
            if weather and weather not in manifest['weather']:
                manifest['weather'][weather] = data['lightSettings']
    manifest['lighting'] = manifest['weather'].get('sunny')
    for site, name in scenes.items():
        prefab = prefabs[base + name + '/' + name + '.prefab']
        if GlbExport().save(prefab, args.output / (name + '.glb')):
            manifest['scenes'][site] = name + '.glb'
    exported = set()
    for row in json.loads(args.master.read_text(encoding='utf8')):
        name = row['assetbundleName']
        key = base + 'object/' + name + '/' + name + '.prefab'
        if key not in prefabs:
            continue
        if name not in exported and not GlbExport().save(prefabs[key], args.output / (name + '.glb')):
            continue
        exported.add(name)
        manifest['fixtures'][str(row['id'])] = name + '.glb'
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')
    print(f'Exported {len(manifest["scenes"])} scenes, {len(manifest["fixtures"])} fixture IDs.', flush=True)


if __name__ == '__main__':
    main()
