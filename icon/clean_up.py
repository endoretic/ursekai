#!/usr/bin/env python3
"""Audit local icons against the generated catalog without deleting assets."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "js/masterdata.js").read_text(encoding="utf-8")
catalog, _ = json.JSONDecoder().raw_decode(source.split("export const ITEM_CATALOG = ", 1)[1])
required = {
    item["icon"]
    for category, items in catalog.items() if category != "material"
    for item in items.values()
}
known = {item["icon"] for items in catalog.values() for item in items.values()}
existing = {path.name for path in (ROOT / "icon/Texture2D").glob("*.png")}
missing = sorted(required - existing)
extra = sorted(existing - known)
print(f"Required MySekai icons: {len(required)}; missing: {len(missing)}")
for name in missing:
    print(f"  Missing: {name}")
for name in extra:
    print(f"  Unregistered (preserved): {name}")
if missing:
    print("Run: python scripts/update_masterdata.py --download-icons")
raise SystemExit(1 if missing else 0)
