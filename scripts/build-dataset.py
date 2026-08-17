"""Parse data/raw/ into curated JSON under data/processed/.

Usage:
    python scripts/build-dataset.py

Run scripts/fetch-sources.py first. This script reads data/manifest.json for
provenance, so every output record can name the exact file it came from.

Design rules taken from the spec:
  - Every record carries source_url, source_year, axis, methodology,
    numerator and denominator. Where a source does not publish a numerator
    and denominator, they are null and the methodology says why. They are
    never reconstructed.
  - The two sources measure different things and are written to separate
    files. Nothing here blends them into one number.
  - Coverage gaps fail the build. If one of the 12 nationalities is missing,
    this script raises rather than quietly writing 11 records.
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sources import NATIONALITIES  # noqa: E402

import openpyxl  # noqa: E402
from pypdf import PdfReader  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = REPO_ROOT / "data" / "manifest.json"
PROCESSED_DIR = REPO_ROOT / "data" / "processed"

UK_SOURCE_ID = "uk_home_office_vis_d02"
US_SOURCE_ID = "us_state_b_visa_adjusted_refusal_rates"

UK_TARGET_YEAR = "2025"
UK_VISA_GROUP = "Visitor"

# Population rate warning attached to every record. The spec calls this the
# single most important honesty rule, so it travels with the data rather than
# living only in the UI layer, where it could be dropped.
BASE_RATE_CAVEAT = (
    "This is a population base rate for a nationality group, not a personal "
    "probability. Do not render it as this applicant's odds."
)


def load_manifest():
    if not MANIFEST_PATH.exists():
        raise SystemExit(
            "data/manifest.json not found. Run python scripts/fetch-sources.py first."
        )
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {source["id"]: source for source in manifest["sources"]}


def raw_path(source):
    path = REPO_ROOT / source["raw_path"]
    if not path.exists():
        raise SystemExit(
            f"{source['raw_path']} not found. Run python scripts/fetch-sources.py first."
        )
    return path


def assert_full_coverage(found, dataset_name):
    """Fail the build if any of the 12 nationalities is missing."""
    missing = [n["name"] for n in NATIONALITIES if n["name"] not in found]
    if missing:
        raise SystemExit(
            f"{dataset_name}: no data found for {', '.join(missing)}. "
            f"The source label may have changed. Check the label columns in "
            f"scripts/sources.py against the raw file before editing this script."
        )


def build_uk(source):
    """UK Home Office Vis_D02, Visitor group, calendar year 2025."""
    wanted = {n["uk_label"]: n for n in NATIONALITIES}
    workbook = openpyxl.load_workbook(raw_path(source), read_only=True, data_only=True)
    sheet = workbook["Data_Vis_D02"]

    # Columns on Data_Vis_D02, header on row 4:
    # 0 Year, 1 Quarter, 2 Nationality, 3 Region, 4 Visa type group,
    # 5 Visa type, 6 Visa type subgroup, 7 Applicant type, 8 Case outcome,
    # 9 Decisions.
    # Within the Visitor group, applicant type is always All and visa type is
    # flat, so there is exactly one row per nationality, quarter and outcome
    # and summing across quarters cannot double count. Verified against the
    # raw file before this script was written.
    counts = defaultdict(lambda: defaultdict(int))
    quarters = defaultdict(set)

    for row in sheet.iter_rows(min_row=5, values_only=True):
        if row[0] is None:
            continue
        if str(row[0]) != UK_TARGET_YEAR or str(row[4]) != UK_VISA_GROUP:
            continue
        nationality = str(row[2])
        if nationality not in wanted:
            continue
        counts[nationality][str(row[8])] += int(row[9] or 0)
        quarters[nationality].add(str(row[1]))

    workbook.close()
    assert_full_coverage({wanted[k]["name"] for k in counts}, "UK Vis_D02")

    records = []
    for nationality in NATIONALITIES:
        outcomes = counts[nationality["uk_label"]]
        issued = outcomes.get("Issued", 0)
        refused = outcomes.get("Refused", 0)
        denominator = issued + refused
        if denominator == 0:
            raise SystemExit(
                f"UK Vis_D02: {nationality['name']} has zero decisions in "
                f"{UK_TARGET_YEAR}. Refusing to write a record with no denominator."
            )
        records.append(
            {
                "nationality": nationality["name"],
                "iso3": nationality["iso3"],
                "destination": source["destination"],
                "visa_group": UK_VISA_GROUP,
                "axis": source["axis"],
                "measure": "refused_share_of_decisions",
                "numerator": refused,
                "denominator": denominator,
                "refusal_rate": round(refused / denominator, 6),
                "refusal_rate_percent": round(refused / denominator * 100, 2),
                "outcome_counts": {
                    "issued": issued,
                    "refused": refused,
                    "withdrawn": outcomes.get("Withdrawn", 0),
                    "lapsed": outcomes.get("Lapsed", 0),
                },
                "quarters_included": sorted(quarters[nationality["uk_label"]]),
                "source_year": source["source_year"],
                "year_basis": source["year_basis"],
                "source_url": source["download_url"],
                "source_landing_url": source["landing_url"],
                "source_table": "Vis_D02",
                "retrieved_at": source["retrieved_at"],
                "methodology": source["methodology"],
                "base_rate_caveat": BASE_RATE_CAVEAT,
            }
        )
    return records


# Matches a table line such as "BAHAMAS, THE 14.46%". The nationality is
# everything before the trailing percentage. Page headers and footers carry no
# percentage and therefore do not match.
US_ROW = re.compile(r"^(?P<name>.+?)\s+(?P<rate>\d{1,3}(?:\.\d{1,2})?)%$")


def parse_us_pdf(path):
    """Return ({nationality label: (rate_percent, published_string, page)}, excluded).

    The table contains one row that is not a nationality:
    "*NON-NATIONALITY BASED ISSUANCES". The footnote on the last page defines
    it as travel documents issued by an authority other than the holder's
    country of nationality, including stateless persons and persons whose
    nationality cannot be determined. It is excluded here so the record count
    is an honest count of nationalities.
    """
    reader = PdfReader(path)
    parsed = {}
    excluded = []
    for page_number, page in enumerate(reader.pages, start=1):
        for line in page.extract_text().splitlines():
            line = line.strip()
            if not line or "ADJUSTED REFUSAL RATE" in line:
                continue
            match = US_ROW.match(line)
            if not match:
                continue
            name = match.group("name").strip()
            if name.startswith("*"):
                excluded.append(name)
                continue
            if name in parsed:
                raise SystemExit(
                    f"US refusal rates: {name} appears more than once in the PDF. "
                    f"Parse is ambiguous, refusing to continue."
                )
            parsed[name] = (
                float(match.group("rate")),
                f"{match.group('rate')}%",
                page_number,
            )
    return parsed, excluded


def build_us(source):
    """US Department of State adjusted refusal rates, B visas, FY2025."""
    parsed, excluded = parse_us_pdf(raw_path(source))
    by_label = {n["us_label"]: n for n in NATIONALITIES}
    found = {by_label[label]["name"] for label in parsed if label in by_label}
    assert_full_coverage(found, "US adjusted refusal rates")

    records = []
    for nationality in NATIONALITIES:
        rate_percent, published, page_number = parsed[nationality["us_label"]]
        records.append(
            {
                "nationality": nationality["name"],
                "iso3": nationality["iso3"],
                "destination": source["destination"],
                "visa_group": "B visitor visas",
                "axis": source["axis"],
                "measure": "adjusted_refusal_rate",
                # The Department publishes the rate only. Reconstructing a
                # numerator and denominator from it would be invention, so
                # both stay null and the methodology explains the omission.
                "numerator": None,
                "denominator": None,
                "refusal_rate": round(rate_percent / 100, 6),
                "refusal_rate_percent": rate_percent,
                "rate_as_published": published,
                "source_page": page_number,
                "source_year": source["source_year"],
                "year_basis": source["year_basis"],
                "source_url": source["download_url"],
                "source_landing_url": source["landing_url"],
                "retrieved_at": source["retrieved_at"],
                "methodology": source["methodology"],
                "base_rate_caveat": BASE_RATE_CAVEAT,
            }
        )
    return records, len(parsed), excluded


def write_dataset(filename, source, records, extra_header=None):
    payload = {
        "schema_version": 1,
        "dataset_id": source["id"],
        "title": source["title"],
        "description": source["description"],
        "destination": source["destination"],
        "axis": source["axis"],
        "source_year": source["source_year"],
        "year_basis": source["year_basis"],
        "source_url": source["download_url"],
        "source_landing_url": source["landing_url"],
        "retrieved_at": source["retrieved_at"],
        "publication": source["publication"],
        "methodology": source["methodology"],
        "base_rate_caveat": BASE_RATE_CAVEAT,
        "generated_by": "scripts/build-dataset.py",
        "record_count": len(records),
    }
    if extra_header:
        payload.update(extra_header)
    payload["records"] = records

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    path = PROCESSED_DIR / filename
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def report(title, records, show_counts):
    print(f"\n{title}")
    if show_counts:
        print(f"  {'nationality':13} {'refused':>8} {'decisions':>10} {'rate':>8}")
        for record in sorted(records, key=lambda r: -r["refusal_rate"]):
            print(
                f"  {record['nationality']:13} {record['numerator']:>8} "
                f"{record['denominator']:>10} {record['refusal_rate_percent']:>7.2f}%"
            )
    else:
        print(f"  {'nationality':13} {'rate':>8}  {'published':>10}  page")
        for record in sorted(records, key=lambda r: -r["refusal_rate"]):
            print(
                f"  {record['nationality']:13} {record['refusal_rate_percent']:>7.2f}%  "
                f"{record['rate_as_published']:>10}  p{record['source_page']}"
            )


def main():
    manifest = load_manifest()

    uk_source = manifest[UK_SOURCE_ID]
    uk_records = build_uk(uk_source)
    uk_path = write_dataset(
        "uk-visitor-refusals.json",
        uk_source,
        uk_records,
        extra_header={"visa_group": UK_VISA_GROUP, "source_table": "Vis_D02"},
    )

    us_source = manifest[US_SOURCE_ID]
    us_records, us_total_rows, us_excluded = build_us(us_source)
    us_path = write_dataset(
        "us-b-visa-refusals.json",
        us_source,
        us_records,
        extra_header={
            "visa_group": "B visitor visas",
            "nationalities_in_source": us_total_rows,
            "non_nationality_rows_excluded": us_excluded,
        },
    )

    report(
        f"UK, Visitor group, calendar year {UK_TARGET_YEAR}, per decision",
        uk_records,
        show_counts=True,
    )
    report(
        "US, B visas, fiscal year 2025, per person adjusted rate",
        us_records,
        show_counts=False,
    )

    print(f"\nwrote {uk_path.relative_to(REPO_ROOT)}  ({len(uk_records)} records)")
    print(f"wrote {us_path.relative_to(REPO_ROOT)}  ({len(us_records)} records)")
    print(f"US PDF contained {us_total_rows} nationalities, 12 selected.")
    if us_excluded:
        print(f"US PDF non nationality rows excluded: {', '.join(us_excluded)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
