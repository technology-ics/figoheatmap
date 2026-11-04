"""Build a privacy-safe aggregate for the FIGO Montréal 2027 Global Research Atlas.

Reads the local Sessionboard extract (or a validated CSV) and writes:
- public/data/atlas.json
- public/geo/countries.geojson
- docs/data-validation-report.md
- docs/data-validation-report.json

The published dataset contains country and scientific-stream counts only.
Individual submission rows are never copied into the website.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "Input"
DOCS_DIR = ROOT / "docs"
PUBLIC_DATA = ROOT / "data" / "atlas.json"
PUBLIC_GEO = ROOT / "geo" / "countries.geojson"
NE_110 = ROOT / "scripts" / "_ne_110m.geojson"
NE_50 = ROOT / "scripts" / "_ne_50m.geojson"

STREAMS = [
    {"id": "mfm", "name": "Maternal fetal medicine"},
    {"id": "cob", "name": "Clinical obstetrics"},
    {"id": "gyn", "name": "Gynaecology"},
    {"id": "srhr", "name": "Sexual and reproductive health and rights"},
    {"id": "rep", "name": "Reproductive medicine"},
    {"id": "wca", "name": "Women's cancer"},
    {"id": "end", "name": "Endocrinology"},
]

# Source label (normalised) -> Natural Earth ADM0_A3.
# Unlisted names are reported as unmatched and are never reassigned.
COUNTRY_ALIASES: dict[str, str] = {
    "albania": "ALB",
    "algeria": "DZA",
    "angola": "AGO",
    "argentina": "ARG",
    "armenia": "ARM",
    "australia": "AUS",
    "austria": "AUT",
    "bahamas": "BHS",
    "the bahamas": "BHS",
    "bangladesh": "BGD",
    "belarus": "BLR",
    "belgium": "BEL",
    "benin": "BEN",
    "bhutan": "BTN",
    "bolivia": "BOL",
    "botswana": "BWA",
    "brazil": "BRA",
    "burkina faso": "BFA",
    "burundi": "BDI",
    "cambodia": "KHM",
    "cameroon": "CMR",
    "canada": "CAN",
    "chile": "CHL",
    "china": "CHN",
    "colombia": "COL",
    "cote d ivoire": "CIV",
    "cote d'ivoire": "CIV",
    "cyprus": "CYP",
    "czechia": "CZE",
    "czech republic": "CZE",
    "democratic republic of the congo": "COD",
    "dem rep congo": "COD",
    "dr congo": "COD",
    "drc": "COD",
    "denmark": "DNK",
    "dominican republic": "DOM",
    "ecuador": "ECU",
    "egypt": "EGY",
    "estonia": "EST",
    "ethiopia": "ETH",
    "fiji": "FJI",
    "france": "FRA",
    "gambia": "GMB",
    "the gambia": "GMB",
    "georgia": "GEO",
    "germany": "DEU",
    "ghana": "GHA",
    "greece": "GRC",
    "guatemala": "GTM",
    "guinea": "GIN",
    "guyana": "GUY",
    "haiti": "HTI",
    "hong kong": "HKG",
    "hong kong sar": "HKG",
    "hong kong sar china": "HKG",
    "india": "IND",
    "indonesia": "IDN",
    "iran": "IRN",
    "ireland": "IRL",
    "italy": "ITA",
    "ivory coast": "CIV",
    "japan": "JPN",
    "kazakhstan": "KAZ",
    "kenya": "KEN",
    "latvia": "LVA",
    "lebanon": "LBN",
    "lesotho": "LSO",
    "liberia": "LBR",
    "libya": "LBY",
    "lithuania": "LTU",
    "luxembourg": "LUX",
    "malawi": "MWI",
    "malaysia": "MYS",
    "mali": "MLI",
    "mexico": "MEX",
    "moldova": "MDA",
    "republic of moldova": "MDA",
    "mongolia": "MNG",
    "morocco": "MAR",
    "mozambique": "MOZ",
    "namibia": "NAM",
    "nepal": "NPL",
    "netherlands": "NLD",
    "the netherlands": "NLD",
    "nicaragua": "NIC",
    "niger": "NER",
    "nigeria": "NGA",
    "norway": "NOR",
    "pakistan": "PAK",
    "palestine": "PSX",
    "state of palestine": "PSX",
    "paraguay": "PRY",
    "peru": "PER",
    "philippines": "PHL",
    "poland": "POL",
    "portugal": "PRT",
    "russia": "RUS",
    "russian federation": "RUS",
    "rwanda": "RWA",
    "saudi arabia": "SAU",
    "senegal": "SEN",
    "serbia": "SRB",
    "republic of serbia": "SRB",
    "sierra leone": "SLE",
    "singapore": "SGP",
    "slovenia": "SVN",
    "south africa": "ZAF",
    "south korea": "KOR",
    "republic of korea": "KOR",
    "korea republic of": "KOR",
    "south sudan": "SDS",
    "s sudan": "SDS",
    "spain": "ESP",
    "sweden": "SWE",
    "switzerland": "CHE",
    "taiwan": "TWN",
    "tanzania": "TZA",
    "united republic of tanzania": "TZA",
    "thailand": "THA",
    "togo": "TGO",
    "tunisia": "TUN",
    "turkey": "TUR",
    "turkiye": "TUR",
    "uganda": "UGA",
    "ukraine": "UKR",
    "united arab emirates": "ARE",
    "uae": "ARE",
    "united kingdom": "GBR",
    "uk": "GBR",
    "great britain": "GBR",
    "united states": "USA",
    "united states of america": "USA",
    "usa": "USA",
    "us": "USA",
    "uruguay": "URY",
    "uzbekistan": "UZB",
    "venezuela": "VEN",
    "vietnam": "VNM",
    "viet nam": "VNM",
    "zambia": "ZMB",
    "zimbabwe": "ZWE",
}

DISPLAY_NAMES = {
    "ARE": "United Arab Emirates",
    "BHS": "Bahamas",
    "CIV": "Côte d'Ivoire",
    "COD": "Democratic Republic of the Congo",
    "CZE": "Czechia",
    "DOM": "Dominican Republic",
    "GBR": "United Kingdom",
    "GMB": "Gambia",
    "HKG": "Hong Kong SAR",
    "KOR": "South Korea",
    "MDA": "Moldova",
    "NLD": "Netherlands",
    "PSX": "Palestine",
    "RUS": "Russia",
    "SRB": "Serbia",
    "SDS": "South Sudan",
    "SGP": "Singapore",
    "TWN": "Taiwan",
    "TUR": "Türkiye",
    "TZA": "Tanzania",
    "USA": "United States",
    "VNM": "Vietnam",
}

PII_COLUMN_PATTERN = re.compile(
    r"email|e-mail|name|author|affiliation|abstract|phone|institution|organisation|organization|presenter|speaker",
    re.I,
)
APPROVED_COLUMNS = {"country", "track name"}


def _norm_key(value: object) -> str:
    text = "" if value is None or (isinstance(value, float) and pd.isna(value)) else str(value)
    text = text.replace("\u2019", "'").replace("\u2018", "'").replace("`", "'")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


STREAM_BY_KEY = {_norm_key(stream["name"]): stream for stream in STREAMS}


def _find_workbook() -> Path:
    files = sorted(
        [
            p
            for p in INPUT_DIR.iterdir()
            if p.suffix.lower() in {".xlsx", ".xlsm", ".xls"} and not p.name.startswith("~$")
        ],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not files:
        raise SystemExit(f"No spreadsheet found in {INPUT_DIR}")
    return files[0]


def _match_column(columns: list[str], target: str) -> str | None:
    wanted = _norm_key(target)
    for column in columns:
        if _norm_key(column) == wanted:
            return column
    return None


def _load_frame(path: Path) -> tuple[pd.DataFrame, str]:
    if path.suffix.lower() == ".csv":
        frame = pd.read_csv(path)
        source_kind = "csv"
    else:
        workbook = pd.ExcelFile(path)
        if len(workbook.sheet_names) != 1:
            # Use the only sheet that contains both required columns.
            chosen = None
            for sheet in workbook.sheet_names:
                preview = pd.read_excel(workbook, sheet_name=sheet, nrows=0)
                if _match_column(list(preview.columns), "country") and _match_column(
                    list(preview.columns), "Track name"
                ):
                    if chosen is not None:
                        raise SystemExit(
                            "More than one worksheet contains country and track columns. "
                            "Refusing to combine incompatible sheets."
                        )
                    chosen = sheet
            if chosen is None:
                raise SystemExit("No worksheet contains both country and Track name columns.")
            frame = pd.read_excel(workbook, sheet_name=chosen)
        else:
            frame = pd.read_excel(workbook, sheet_name=workbook.sheet_names[0])
        source_kind = "workbook"
    return frame, source_kind


def _reject_unsafe_columns(columns: list[str]) -> None:
    normalised = {_norm_key(column) for column in columns}
    unexpected = sorted(normalised - APPROVED_COLUMNS)
    pii = [column for column in columns if PII_COLUMN_PATTERN.search(column) and _norm_key(column) not in APPROVED_COLUMNS]
    # "Country" can match the name pattern only as a whole word false positive if we search "name".
    # Guard: flag real personal columns, not the approved country field.
    if pii or unexpected:
        raise SystemExit(
            "Refusing to build a public dataset. The source has columns outside the approved "
            f"country and scientific-stream fields. Unexpected: {unexpected or pii}. "
            "Individual records must stay in the private processing environment."
        )


def _prepare_rows(frame: pd.DataFrame) -> tuple[list[dict], dict]:
    columns = [str(column) for column in frame.columns]
    _reject_unsafe_columns(columns)
    country_col = _match_column(columns, "country")
    track_col = _match_column(columns, "Track name")
    if not country_col or not track_col:
        raise SystemExit("Required columns country and Track name were not found.")

    session_col = _match_column(columns, "session_id")
    form_col = _match_column(columns, "submission_form")
    status_col = _match_column(columns, "display_status")
    title_col = _match_column(columns, "title")

    notes = {
        "sessionIdAvailable": bool(session_col),
        "submissionFormAvailable": bool(form_col),
        "statusAvailable": bool(status_col),
        "titleAvailable": bool(title_col),
        "eligibility": (
            "Each row in the supplied extract is counted once as an abstract submission. "
            "The extract has no session identifier, submission form, status or title, so "
            "duplicate identifiers, bursary applications and test titles cannot be detected. "
            "Counts describe submissions in this extract. They do not describe accepted research."
        ),
    }

    rows = []
    seen_ids = set()
    duplicate_ids = 0
    for record in frame.to_dict(orient="records"):
        if session_col:
            session_id = str(record.get(session_col) or "").strip()
            if session_id:
                if session_id in seen_ids:
                    duplicate_ids += 1
                    continue
                seen_ids.add(session_id)
        if title_col:
            title = str(record.get(title_col) or "")
            if "testing123" in title.lower():
                notes.setdefault("excludedTestTitles", 0)
                notes["excludedTestTitles"] += 1
                continue
        if form_col:
            form = _norm_key(record.get(form_col))
            if "bursary" in form:
                notes.setdefault("excludedBursaries", 0)
                notes["excludedBursaries"] += 1
                continue
            if form and "abstract" not in form:
                notes.setdefault("excludedOtherForms", 0)
                notes["excludedOtherForms"] += 1
                continue
        country_raw = record.get(country_col)
        track_raw = record.get(track_col)
        country_blank = country_raw is None or (isinstance(country_raw, float) and pd.isna(country_raw)) or str(country_raw).strip() == ""
        track_key = _norm_key(track_raw)
        stream = STREAM_BY_KEY.get(track_key)
        rows.append(
            {
                "countryBlank": country_blank,
                "countryRaw": None if country_blank else str(country_raw).strip(),
                "countryKey": None if country_blank else _norm_key(country_raw),
                "stream": stream,
                "trackRaw": None if track_raw is None or (isinstance(track_raw, float) and pd.isna(track_raw)) else str(track_raw).strip(),
            }
        )
    notes["duplicateIdsSkipped"] = duplicate_ids
    return rows, notes


def _load_features() -> list[dict]:
    base = json.loads(NE_110.read_text(encoding="utf-8"))
    extra = json.loads(NE_50.read_text(encoding="utf-8"))
    features = list(base["features"])
    present = {feature["properties"].get("ADM0_A3") for feature in features}
    needed = set(COUNTRY_ALIASES.values())
    for feature in extra["features"]:
        code = feature["properties"].get("ADM0_A3")
        if code in needed and code not in present:
            features.append(feature)
            present.add(code)
    return features


def _feature_name(props: dict, code: str) -> str:
    if code in DISPLAY_NAMES:
        return DISPLAY_NAMES[code]
    admin = props.get("ADMIN") or props.get("NAME") or code
    return str(admin)


def _build_geo(features: list[dict]) -> dict:
    cleaned = []
    for feature in features:
        props = feature["properties"]
        code = props.get("ADM0_A3")
        if not code:
            continue
        cleaned.append(
            {
                "type": "Feature",
                "properties": {
                    "id": code,
                    "name": _feature_name(props, code),
                    "continent": props.get("CONTINENT") or "",
                },
                "geometry": feature["geometry"],
            }
        )
    return {"type": "FeatureCollection", "features": cleaned}


def _rank_key(name: str, code: str) -> tuple[str, str]:
    return (name.casefold(), code)


def _alias_terms(countries: list[dict]) -> dict[str, set[str]]:
    grouped: dict[str, set[str]] = defaultdict(set)
    for label, code in COUNTRY_ALIASES.items():
        grouped[code].add(label)
    for country in countries:
        grouped[country["id"]].add(country["name"])
        grouped[country["id"]].add(_norm_key(country["name"]))
    return grouped


def build(source: Path, source_modified: datetime | None, retrieved_at: datetime | None) -> dict:
    frame, source_kind = _load_frame(source)
    rows, notes = _prepare_rows(frame)
    features = _load_features()
    feature_by_id = {}
    for feature in features:
        code = feature["properties"].get("ADM0_A3")
        if code and code not in feature_by_id:
            feature_by_id[code] = feature

    blank = 0
    unmatched: dict[str, int] = defaultdict(int)
    unassigned_stream = 0
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    eligible = 0

    for row in rows:
        eligible += 1
        stream = row["stream"]
        if stream is None:
            unassigned_stream += 1
            stream_id = "unassigned"
        else:
            stream_id = stream["id"]
        if row["countryBlank"]:
            blank += 1
            continue
        code = COUNTRY_ALIASES.get(row["countryKey"])
        if not code or code not in feature_by_id:
            unmatched[row["countryRaw"]] += 1
            continue
        counts[code][stream_id] += 1

    countries = []
    for code, by_stream in counts.items():
        props = feature_by_id[code]["properties"]
        name = _feature_name(props, code)
        stream_counts = {stream["id"]: int(by_stream.get(stream["id"], 0)) for stream in STREAMS}
        total = sum(stream_counts.values())
        ranked_streams = sorted(
            STREAMS,
            key=lambda stream: (-stream_counts[stream["id"]], stream["name"].casefold()),
        )
        leader = ranked_streams[0]
        countries.append(
            {
                "id": code,
                "name": name,
                "continent": props.get("CONTINENT") or "",
                "count": total,
                "streams": stream_counts,
                "leadingStreamId": leader["id"] if total else None,
            }
        )

    countries.sort(key=lambda country: (-country["count"], *_rank_key(country["name"], country["id"])))
    geographic_total = sum(country["count"] for country in countries)
    stream_totals = []
    for stream in STREAMS:
        stream_count = sum(country["streams"][stream["id"]] for country in countries)
        # Unassigned geography still belongs in the stream total when the stream is valid
        # but the country is blank or unmatched.
        stream_totals.append(stream_count)

    # Recompute stream totals from all eligible rows, including those without a mapped country.
    full_stream_totals = {stream["id"]: 0 for stream in STREAMS}
    for row in rows:
        if row["stream"] is None:
            continue
        full_stream_totals[row["stream"]["id"]] += 1

    leading_country = countries[0]
    leading_stream = sorted(
        STREAMS,
        key=lambda stream: (-full_stream_totals[stream["id"]], stream["name"].casefold()),
    )[0]

    mapped_stream_sum = sum(full_stream_totals.values())
    continents = sorted({country["continent"] for country in countries if country["continent"]})
    all_seven = [
        country["name"]
        for country in countries
        if all(country["streams"][stream["id"]] > 0 for stream in STREAMS)
    ]
    stream_country_counts = []
    for stream in STREAMS:
        represented = sum(1 for country in countries if country["streams"][stream["id"]] > 0)
        leaders = [country for country in countries if country["streams"][stream["id"]] > 0]
        leaders.sort(
            key=lambda country: (
                -country["streams"][stream["id"]],
                *_rank_key(country["name"], country["id"]),
            )
        )
        leader = leaders[0] if leaders else None
        stream_country_counts.append(
            {
                "id": stream["id"],
                "name": stream["name"],
                "count": full_stream_totals[stream["id"]],
                "countries": represented,
                "leadingCountryId": leader["id"] if leader else None,
                "leadingCountryName": leader["name"] if leader else None,
                "leadingCountryCount": leader["streams"][stream["id"]] if leader else 0,
            }
        )
    widest = max(stream_country_counts, key=lambda item: (item["countries"], item["count"], item["name"]))

    aliases_used = sorted(
        {
            row["countryRaw"]
            for row in rows
            if row["countryKey"]
            and COUNTRY_ALIASES.get(row["countryKey"])
            and _norm_key(row["countryRaw"]) != _norm_key(DISPLAY_NAMES.get(COUNTRY_ALIASES[row["countryKey"]], ""))
            and row["countryRaw"] not in {"United States", "United Kingdom", "South Korea", "Czechia", "Russia", "Vietnam", "Tanzania", "Palestine", "Moldova", "Bahamas", "Gambia", "Netherlands"}
        }
    )

    modified = source_modified or datetime.fromtimestamp(source.stat().st_mtime)
    updated = retrieved_at or modified
    atlas = {
        "meta": {
            "congress": "FIGO Montréal 2027",
            "datasetLabel": "Abstract submissions",
            "updatedAt": updated.astimezone().isoformat(timespec="seconds"),
            "sourceModifiedAt": modified.astimezone().isoformat(timespec="seconds"),
            "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
            "sourceKind": source_kind,
            "sourceFileName": source.name,
            "live": False,
            "eligibility": notes["eligibility"],
            "tieBreak": (
                "Higher counts rank first. Equal counts are ordered by country or stream name "
                "from A to Z using British English case-insensitive alphabetical order, then by code. "
                "Tied countries share a competition rank, and the Top 10 list keeps every country "
                "tied with the final included place."
            ),
            "geographicPolicy": (
                "Country boundaries are Natural Earth admin-0, public domain, at 1:110m, "
                "with 1:50m shapes added only for Singapore and Hong Kong SAR because they are "
                "omitted from the 1:110m countries file. The map does not assert a political "
                "position. Taiwan, Palestine, Kosovo, Northern Cyprus, Somaliland and Western Sahara "
                "appear as published by Natural Earth and should be reviewed by FIGO."
            ),
            "counts": {
                "rowsRead": int(len(frame)),
                "eligibleSubmissions": eligible,
                "blankCountry": blank,
                "unmatchedCountrySubmissions": int(sum(unmatched.values())),
                "unmatchedCountryNames": sorted(unmatched),
                "unassignedStream": unassigned_stream,
                "countriesRepresented": len(countries),
                "geographicSubmissions": geographic_total,
                "duplicateIdsSkipped": notes["duplicateIdsSkipped"],
            },
            "streamTotals": full_stream_totals,
            "unlocatedSubmissions": blank + int(sum(unmatched.values())),
        },
        "streams": STREAMS,
        "aliases": [
            {
                "id": code,
                "terms": sorted(terms),
            }
            for code, terms in sorted(
                _alias_terms(countries).items(),
                key=lambda item: item[0],
            )
        ],
        "countries": [
            {
                "id": country["id"],
                "name": country["name"],
                "continent": country["continent"],
                "count": country["count"],
                "streams": country["streams"],
                "leadingStreamId": country["leadingStreamId"],
            }
            for country in countries
        ],
        "insights": {
            "continents": continents,
            "countriesInAllStreams": all_seven,
            "widestStreamId": widest["id"],
            "streamCountryCounts": [
                {"id": item["id"], "name": item["name"], "countries": item["countries"]}
                for item in stream_country_counts
            ],
        },
    }

    # Reconciliation checks. Fail the build rather than publish a mismatched file.
    country_sum = sum(country["count"] for country in atlas["countries"])
    stream_sum = sum(full_stream_totals.values())
    cross = sum(sum(country["streams"].values()) for country in atlas["countries"])
    if country_sum != geographic_total or cross != geographic_total:
        raise SystemExit("Country totals do not reconcile.")
    if stream_sum + unassigned_stream != eligible:
        raise SystemExit("Stream totals do not reconcile with eligible submissions.")
    if geographic_total + blank + sum(unmatched.values()) != eligible - unassigned_stream + unassigned_stream:
        # geographic + blank + unmatched should equal eligible, including unassigned-stream rows.
        outside = blank + sum(unmatched.values())
        # Rows with a stream and a country are in geographic_total.
        # Rows with no stream are still in blank/unmatched/geographic if country matched.
        if geographic_total + outside != eligible:
            raise SystemExit(
                f"Totals do not reconcile: geographic {geographic_total}, outside {outside}, eligible {eligible}"
            )
    if leading_country["count"] != max(country["count"] for country in atlas["countries"]):
        raise SystemExit("Leading country check failed.")

    report = {
        "eligibleSubmissions": eligible,
        "countriesRepresented": len(countries),
        "leadingCountry": {"name": leading_country["name"], "count": leading_country["count"]},
        "leadingStream": {
            "name": leading_stream["name"],
            "count": full_stream_totals[leading_stream["id"]],
        },
        "blankCountry": blank,
        "unmatched": dict(sorted(unmatched.items())),
        "unassignedStream": unassigned_stream,
        "streamTotals": {stream["name"]: full_stream_totals[stream["id"]] for stream in STREAMS},
        "streamLeaders": {
            item["name"]: {
                "country": item["leadingCountryName"],
                "count": item["leadingCountryCount"],
                "countries": item["countries"],
            }
            for item in stream_country_counts
        },
        "top10": [
            {"rank": index + 1, "name": country["name"], "count": country["count"]}
            for index, country in enumerate(countries[:10])
        ],
        "countriesInAllStreams": all_seven,
        "continents": continents,
        "aliasesDocumented": len(COUNTRY_ALIASES),
        "sourceAliasExamples": aliases_used,
        "notes": notes,
        "reconciliation": {
            "eligible": eligible,
            "streamSum": stream_sum,
            "geographicPlusBlankPlusUnmatched": geographic_total + blank + sum(unmatched.values()),
            "countrySum": country_sum,
        },
    }
    atlas["_report"] = report
    return atlas


def _write_report(report: dict, atlas: dict) -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    (DOCS_DIR / "data-validation-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    counts = atlas["meta"]["counts"]
    lines = [
        "# Data validation report",
        "",
        "This report describes the privacy-safe aggregate used by the Global Research Atlas.",
        "It does not contain personal information or submission text.",
        "",
        "## Eligibility",
        "",
        atlas["meta"]["eligibility"],
        "",
        "The public label is **abstract submissions**. Nothing in the source marks a record as accepted.",
        "",
        "## Reconciliation",
        "",
        f"- Eligible submissions: **{report['eligibleSubmissions']}**",
        f"- Sum of scientific-stream totals: **{report['reconciliation']['streamSum']}**",
        f"- Countries represented: **{report['countriesRepresented']}**",
        f"- Submissions with a matched country: **{report['reconciliation']['countrySum']}**",
        f"- Blank country: **{report['blankCountry']}**",
        f"- Unmatched country submissions: **{sum(report['unmatched'].values())}**",
        f"- Geographic + blank + unmatched: **{report['reconciliation']['geographicPlusBlankPlusUnmatched']}**",
        "",
        "These three views of the same extract reconcile to the eligible total.",
        "",
        "## Leading figures",
        "",
        f"- Leading country: {report['leadingCountry']['name']} ({report['leadingCountry']['count']})",
        f"- Leading scientific stream: {report['leadingStream']['name']} ({report['leadingStream']['count']})",
        "",
        "## Scientific streams",
        "",
        "| Stream | Submissions | Countries | Leading country |",
        "|---|---:|---:|---|",
    ]
    for name, info in report["streamTotals"].items():
        leader = report["streamLeaders"][name]
        lines.append(
            f"| {name} | {info} | {leader['countries']} | {leader['country']} ({leader['count']}) |"
        )
    lines += [
        "",
        "## Unmatched and blank country values",
        "",
        "Blank countries remain in the submission total and are excluded from the map and from the country count.",
        "",
    ]
    if report["unmatched"]:
        lines.append("Unmatched labels, with submission counts:")
        lines.append("")
        for name, count in report["unmatched"].items():
            lines.append(f"- `{name}`: {count}")
    else:
        lines.append("No unmatched country names.")
    lines += [
        "",
        "## Tie-breaking",
        "",
        atlas["meta"]["tieBreak"],
        "",
        "## Geographic notes",
        "",
        atlas["meta"]["geographicPolicy"],
        "",
        f"Alias entries in the mapping table: {report['aliasesDocumented']}.",
        "",
        "## Source limits",
        "",
        f"- Session identifiers available: {report['notes']['sessionIdAvailable']}",
        f"- Submission form available: {report['notes']['submissionFormAvailable']}",
        f"- Status available: {report['notes']['statusAvailable']}",
        f"- Title available: {report['notes']['titleAvailable']}",
        "",
        "Because those fields are absent, the pipeline cannot remove test titles or bursary applications, and it cannot deduplicate on `session_id`. Repeated country and stream combinations are separate submissions, not duplicate identifiers.",
        "",
    ]
    (DOCS_DIR / "data-validation-report.md").write_text("\n".join(lines), encoding="utf-8")


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def write_outputs(atlas: dict) -> None:
    report = atlas.pop("_report")
    _atomic_write(PUBLIC_DATA, json.dumps(atlas, ensure_ascii=False, separators=(",", ":")))
    geo = _build_geo(_load_features())
    _atomic_write(PUBLIC_GEO, json.dumps(geo, ensure_ascii=False, separators=(",", ":")))
    _write_report(report, atlas)
    print(
        f"Eligible {report['eligibleSubmissions']}; "
        f"countries {report['countriesRepresented']}; "
        f"leading {report['leadingCountry']['name']} {report['leadingCountry']['count']}; "
        f"stream {report['leadingStream']['name']}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, help="Workbook or CSV. Defaults to the newest spreadsheet in Input/.")
    args = parser.parse_args()
    source = args.source or _find_workbook()
    if not source.exists():
        raise SystemExit(f"Source not found: {source}")
    atlas = build(source, source_modified=None, retrieved_at=None)
    write_outputs(atlas)


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
