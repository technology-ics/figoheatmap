import json
from pathlib import Path

geo = json.loads(Path("scripts/_ne_110m.geojson").read_text(encoding="utf-8"))
props = geo["features"][0]["properties"]
print("N", len(geo["features"]))
print("KEYS", sorted(props.keys()))
rows = []
for f in geo["features"]:
    p = f["properties"]
    rows.append(
        {
            "NAME": p.get("NAME"),
            "ADMIN": p.get("ADMIN"),
            "ISO_A3": p.get("ISO_A3"),
            "ADM0_A3": p.get("ADM0_A3"),
            "ISO_A2": p.get("ISO_A2"),
        }
    )
Path("scripts/_ne_names.json").write_text(
    json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("wrote names", len(rows))
