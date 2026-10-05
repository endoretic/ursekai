"""Extract a small weather palette from local decoded JP UnityFS bundles. No network or keys."""
import argparse
import json
from pathlib import Path
import re

import UnityPy

# Only textures used by the lightweight browser effects, not the entire particle library.
SPRITES = {
    'snow': 'tex_env_011_snownight_snow_01',
    'bubble': 'tex_env_012_soapbubble_bubble_01',
    'waterBubble': 'tex_env_016_underwater_bubble',
    'note': 'tex_env_014_sekai_note_01',
    'star': 'tex_env_013_universe_twinkle',
    'moon': 'tex_env_010_fullmoon_01',
    'rainbow': 'tex_env_017_rainbow_rainbow_base_02',
    'milkyway': 'tex_env_009_meteorshower_milkyway',
    'nebula': 'tex_env_013_universe_milkyway',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundles', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--asset-version', required=True)
    args = parser.parse_args()
    UnityPy.config.FALLBACK_UNITY_VERSION = '2022.3.21f1'
    env = UnityPy.load(*[str(p) for p in args.bundles.rglob('*') if p.is_file() and p.suffix != '.sha'])
    args.output.mkdir(parents=True, exist_ok=True)
    textures = {obj.read().m_Name: obj for obj in env.objects if obj.type.name == 'Texture2D'}
    result = {'region': 'jp', 'assetVersion': args.asset_version, 'weather': {}, 'sprites': {}}

    def save_texture(obj, filename):
        obj.read().image.save(args.output / filename)
        return filename

    for key, name in SPRITES.items():
        filename = key + '.png'
        image = textures[name].read().image
        if key == 'snow':
            # The source is a 2x2 sprite sheet; one flake is enough for the lightweight particle pool.
            image = image.crop((0, 0, image.width // 2, image.height // 2))
        image.save(args.output / filename)
        result['sprites'][key] = filename
    for path, pointer in env.container.items():
        match = re.search(r'/environment/(\d{3})_\w+/global/', path)
        if not match or pointer.type.name != 'MonoBehaviour':
            continue
        weather_id = int(match[1])
        if not 1 <= weather_id <= 17:
            continue
        data = pointer.read_typetree()
        entry = result['weather'].setdefault(weather_id, {})
        obj = pointer.read()
        if 'lightSettings' in data:
            entry['light'] = data['lightSettings']
            cloud = obj.cloudSettings
            entry['cloud'] = {'opacity': cloud.cloudShadowOpacity,
                              'size': cloud.cloudShadowTextureSize,
                              'speed': cloud.cloudScrollSpeed,
                              'direction': [cloud.cloudScrollVelocity.x, cloud.cloudScrollVelocity.y]}
            if cloud.cloudShadowTexture.path_id:
                entry['cloud']['texture'] = save_texture(cloud.cloudShadowTexture, f'cloud-{weather_id}.png')
        if data.get('m_Name', '').startswith('ramp_sky_'):
            entry['ramp'] = save_texture(obj._texture, f'sky-{weather_id}.png')
    assert set(result['weather']) == set(range(1, 18))
    assert all('light' in row and 'ramp' in row for row in result['weather'].values())
    (args.output / 'weather.json').write_text(json.dumps(result, indent=2), encoding='utf8')
    print(f'Exported 17 JP weather palettes and {len(SPRITES)} effect textures ({args.asset_version}).')


if __name__ == '__main__':
    main()
