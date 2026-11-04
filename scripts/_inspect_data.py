import json
from pathlib import Path

import pandas as pd

df = pd.read_excel(Path("Input/Data.xlsx"))
tracks = sorted(df["Track name"].dropna().unique().tolist(), key=str)
countries = sorted({str(x) for x in df["Country"].dropna().unique()})

out = {
    "rows": int(len(df)),
    "tracks": tracks,
    "odd_countries": [],
}
for c in countries:
    if any(ord(ch) > 127 for ch in c) or any(ch in c for ch in "[]") or c in {
        "DR Congo",
        "Ivory Coast",
        "South Korea",
        "Hong Kong",
        "Taiwan",
        "Palestine",
        "Czechia",
        "Russia",
    }:
        out["odd_countries"].append(
            {
                "name": c,
                "codepoints": [hex(ord(ch)) for ch in c if ord(ch) > 127],
            }
        )

Path("scripts/_inspect_out.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("wrote inspect")
