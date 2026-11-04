"""Refresh the public aggregate from the approved Google Sheet.

The browser never requests this sheet. The script downloads it privately,
rejects any file that is not limited to country and scientific stream,
validates the aggregate, and only then replaces atlas.json.

A failed refresh leaves the previous dataset unchanged.
"""

from __future__ import annotations

import sys
import urllib.error
import urllib.request
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

from build_atlas import build, write_outputs

ROOT = Path(__file__).resolve().parents[1]
SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSh0HljD2WpZh2bz55F0AmmpQEUKTjHCT8DTLCVdzhJzbYeOCobmXgsQBs7go_3t_WE02WXctzeDKrX/pub?output=csv"
)
PRIVATE_DIR = ROOT / "scripts" / "_private"


def main() -> None:
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    destination = PRIVATE_DIR / "sheet.csv"
    request = urllib.request.Request(SHEET_URL, headers={"User-Agent": "FIGO-atlas-refresh"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
            last_modified = response.headers.get("Last-Modified")
    except urllib.error.URLError as error:
        raise SystemExit(
            f"Refresh failed before any public file was changed. The sheet could not be read ({error})."
        ) from error

    # Keep the download out of the website directory.
    destination.write_bytes(payload)
    modified = None
    if last_modified:
        try:
            modified = parsedate_to_datetime(last_modified)
        except (TypeError, ValueError):
            modified = None
    retrieved = datetime.now().astimezone()
    atlas = build(destination, source_modified=modified, retrieved_at=retrieved)
    write_outputs(atlas)
    print("Refresh completed and replaced the public aggregate.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:
        print("Refresh failed. The previous public dataset was left unchanged.")
        print(error)
        sys.exit(1)
