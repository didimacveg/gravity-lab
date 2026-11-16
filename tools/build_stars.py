#!/usr/bin/env python3
"""Build web/data/stars.json, the background star catalogue.

Input: the star files shipped with d3-celestial 0.7.35 (BSD-3-Clause,
Olaf Frohn), which are a GeoJSON export of XHIP, the Extended Hipparcos
Compilation (Anderson & Francis 2012, VizieR V/137D):

    npm pack d3-celestial@0.7.35 && tar xzf d3-celestial-0.7.35.tgz
    python3 tools/build_stars.py package/data

Output: every star down to magnitude 5.5 as flat rows
[RA deg, Dec deg, V magnitude, B-V], J2000 equatorial, plus proper names
for the brightest ones. Nothing is invented and nothing is placed by hand.
"""
import json
import os
import sys

MAG_LIMIT = 5.5
NAME_LIMIT = 2.6

src = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
stars = json.load(open(os.path.join(src, "stars.6.json"), encoding="utf-8"))["features"]
names = json.load(open(os.path.join(src, "starnames.json"), encoding="utf-8"))

rows, labels = [], []
for f in sorted(stars, key=lambda f: f["properties"]["mag"]):
    mag = f["properties"]["mag"]
    if mag > MAG_LIMIT:
        continue
    ra, dec = f["geometry"]["coordinates"]
    ra %= 360.0
    try:
        bv = float(f["properties"]["bv"])
    except (TypeError, ValueError):
        bv = 0.6
    name = names.get(str(f["id"]), {}).get("name", "")
    if name and mag <= NAME_LIMIT:
        labels.append([len(rows), name])
    rows.append([round(ra, 3), round(dec, 3), round(mag, 2), round(bv, 2)])

out = {
    "source": "XHIP: An Extended Hipparcos Compilation (Anderson & Francis 2012, "
              "VizieR V/137D), via d3-celestial 0.7.35 (BSD-3-Clause, Olaf Frohn)",
    "frame": "equatorial J2000, degrees",
    "columns": ["ra", "dec", "mag", "bv"],
    "stars": rows,
    "names": labels,
}
path = os.path.join(root, "web", "data", "stars.json")
with open(path, "w", encoding="utf-8") as fh:
    json.dump(out, fh, separators=(",", ":"), ensure_ascii=False)
    fh.write("\n")
print(len(rows), "stars,", len(labels), "named ->", path)
