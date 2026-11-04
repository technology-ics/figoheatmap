"""Download Natural Earth admin-0 country boundaries used by the atlas build.

The processed geography committed in public/geo is enough to run the website.
Run this only when regenerating that file. Natural Earth data are public domain.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "scripts"
FILES = {
    "_ne_110m.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
    "_ne_50m.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson",
}


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for name, url in FILES.items():
        target = DEST / name
        print(f"Downloading {name}")
        urllib.request.urlretrieve(url, target)
        print(f"  {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
