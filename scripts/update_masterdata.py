#!/usr/bin/env python3
"""Refresh the JP harvest catalog; optionally download missing icons for local use."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "Sekai-World/sekai-master-db-diff"
ASSET_BASE = "https://storage.sekai.best/sekai-jp-assets"
TABLES = (
    "mysekaiMaterials", "mysekaiItems", "mysekaiFixtures",
    "mysekaiFixturePlants", "mysekaiSiteHarvestFixtures", "materials",
)


def fetch(url):
    # The public asset CDN rejects Python's default user agent.
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def indexed(rows):
    result = {row["id"]: row for row in rows}
    if not result or len(result) != len(rows):
        raise ValueError("Empty master table or duplicate IDs")
    return result


def make_item(row, icon, folder, rarity=None):
    if not re.fullmatch(r"[A-Za-z0-9_]+", icon):
        raise ValueError(f"Unexpected icon name: {icon!r}")
    item = {"name": row["name"], "icon": f"{icon}.png", "folder": folder}
    if rarity:
        item["rarity"] = rarity
    return item


def build_catalog(tables):
    materials = indexed(tables["mysekaiMaterials"])
    items = indexed(tables["mysekaiItems"])
    fixtures = indexed(tables["mysekaiFixtures"])
    plants = indexed(tables["mysekaiFixturePlants"])
    harvest = indexed(tables["mysekaiSiteHarvestFixtures"])
    general_materials = indexed(tables["materials"])
    catalog = {
        "mysekai_material": {
            str(key): make_item(
                row, row["iconAssetbundleName"], "mysekai/thumbnail/material", row["mysekaiMaterialRarityType"]
            )
            for key, row in sorted(materials.items())
        },
        "mysekai_item": {
            str(key): make_item(row, row["iconAssetbundleName"], "mysekai/thumbnail/item")
            for key, row in sorted(items.items())
        },
        "mysekai_fixture": {},
        "material": {
            str(key): make_item(row, f"material{key}", "thumbnail/material")
            for key, row in sorted(general_materials.items())
        },
    }
    # Only ungrown plants are harvest drops; do not add the whole furniture shop.
    for key in sorted({row["beforeMysekaiFixtureId"] for row in plants.values()}):
        row = fixtures[key]
        catalog["mysekai_fixture"][str(key)] = make_item(
            row, f"{row['assetbundleName']}_{key}", "mysekai/thumbnail/fixture"
        )
        catalog["mysekai_fixture"][str(key)]["remoteIcon"] = f"{row['assetbundleName']}_{key}_1.png"
    fixture_types = {str(key): row["mysekaiSiteHarvestFixtureType"] for key, row in sorted(harvest.items())}
    return catalog, fixture_types


def export_object(name, value):
    return f"export const {name} = {json.dumps(value, ensure_ascii=False, indent=4)};\n"


def download_icons(catalog, material_ids):
    icons = {
        item["icon"]: item
        for category, items in catalog.items()
        for key, item in items.items()
        if category != "material" or int(key) in material_ids
    }
    pending = [item for icon, item in icons.items() if not (ROOT / "icon/Texture2D" / icon).is_file()]

    def download(item):
        path = ROOT / "icon/Texture2D" / item["icon"]
        url = f"{ASSET_BASE}/{item['folder']}/{item.get('remoteIcon', item['icon'])}"
        try:
            data = fetch(url)
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Response is not a PNG")
            temporary = path.with_suffix(".png.tmp")
            temporary.write_bytes(data)
            temporary.replace(path)
            return None
        except Exception as error:
            return f"{item['icon']}: {error}"

    with ThreadPoolExecutor(max_workers=4) as pool:
        errors = [error for error in pool.map(download, pending) if error]
    print(f"Icons: {len(pending) - len(errors)} downloaded, {len(icons) - len(pending)} already present")
    if errors:
        raise RuntimeError("Icon downloads failed:\n" + "\n".join(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", default="main", help="JP master-data branch or commit (default: main)")
    parser.add_argument("--download-icons", action="store_true", help="Download missing PNGs; excluded from Git")
    parser.add_argument("--material-id", type=int, action="append", default=[],
                        help="Also download this ordinary material reward (repeatable)")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_./-]+", args.ref):
        parser.error("Invalid Git ref")

    commit = json.loads(fetch(f"https://api.github.com/repos/{REPOSITORY}/commits/{args.ref}"))
    sha = commit["sha"]
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Unexpected commit SHA")

    def read_table(name):
        url = f"https://raw.githubusercontent.com/{REPOSITORY}/{sha}/{name}.json"
        return name, json.loads(fetch(url))

    with ThreadPoolExecutor(max_workers=4) as pool:
        tables = dict(pool.map(read_table, TABLES))
    catalog, fixture_types = build_catalog(tables)
    source = {
        "region": "jp", "repository": REPOSITORY, "commit": sha,
        "committedAt": commit["commit"]["committer"]["date"], "tables": list(TABLES),
    }
    text = "// Generated by scripts/update_masterdata.py. Do not edit by hand.\n\n"
    text += export_object("MASTER_DATA_SOURCE", source) + "\n"
    text += export_object("ITEM_CATALOG", catalog) + "\n"
    text += export_object("HARVEST_FIXTURE_TYPES", fixture_types)
    output = ROOT / "js/masterdata.js"
    temporary = output.with_suffix(".js.tmp")
    temporary.write_text(text, encoding="utf-8", newline="\n")
    temporary.replace(output)
    print(f"JP master data: {sha} ({source['committedAt']})")
    print(", ".join(f"{key}: {len(value)}" for key, value in catalog.items()))
    print(f"Harvest fixtures: {len(fixture_types)}")
    if args.download_icons:
        unknown_ids = set(args.material_id) - {int(key) for key in catalog["material"]}
        if unknown_ids:
            raise ValueError(f"Unknown ordinary material IDs: {sorted(unknown_ids)}")
        download_icons(catalog, set(args.material_id))


if __name__ == "__main__":
    main()
