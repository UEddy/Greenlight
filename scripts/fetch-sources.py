"""Download every raw source into data/raw/ and write data/manifest.json.

Usage:
    python scripts/fetch-sources.py            skip files already downloaded
    python scripts/fetch-sources.py --force    download everything again

data/raw/ is gitignored. Raw files are never committed and never read at
runtime. They exist only so scripts/build-dataset.py can turn them into the
curated JSON under data/processed/.

The manifest is written by this script rather than the build script because
retrieval date, byte size and checksum are facts about the fetch, not about
the parse.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sources import SOURCES, USER_AGENT  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw"
MANIFEST_PATH = REPO_ROOT / "data" / "manifest.json"

TIMEOUT_SECONDS = 600


def human_bytes(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024.0


def download(url, destination, force):
    """Fetch url into destination. Returns (bytes, sha256, was_cached).

    Downloads go through curl rather than urllib. travel.state.gov sits behind
    a filter that rejects urllib with 403 no matter which headers are set,
    including a full browser User-Agent, Accept and Accept-Language. It
    fingerprints below the header layer. curl is accepted, ships with Windows
    10 1803 and later, and is present in Git Bash, so it is the transport for
    every source here.
    """
    if destination.exists() and destination.stat().st_size > 0 and not force:
        raw = destination.read_bytes()
        return len(raw), hashlib.sha256(raw).hexdigest(), True

    if shutil.which("curl") is None:
        raise RuntimeError(
            "curl not found on PATH. It is required because travel.state.gov "
            "rejects Python's urllib regardless of headers."
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    # Download to a temporary file so a failed fetch cannot leave a truncated
    # or half written file sitting in data/raw/ to be parsed later.
    handle, temp_name = tempfile.mkstemp(dir=str(destination.parent), suffix=".part")
    temp_path = Path(temp_name)
    os.close(handle)

    try:
        result = subprocess.run(
            [
                "curl", "-sS", "-L",
                "--max-time", str(TIMEOUT_SECONDS),
                "-A", USER_AGENT,
                "-H", "Accept: */*",
                "-o", str(temp_path),
                "-w", "%{http_code} %{content_type}",
                url,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"curl exited {result.returncode}: {result.stderr.strip()}"
            )

        parts = result.stdout.strip().split(None, 1)
        status = parts[0]
        content_type = parts[1] if len(parts) > 1 else ""

        if status != "200":
            raise RuntimeError(f"HTTP {status} for {url}")

        # A filtered host can answer 200 with an HTML block page. Catch that
        # here rather than letting the parser fail later with a confusing
        # error about a corrupt spreadsheet.
        if "text/html" in content_type.lower():
            raise RuntimeError(
                f"expected a data file but the server returned HTML "
                f"(Content-Type: {content_type}). The request was probably blocked."
            )

        payload = temp_path.read_bytes()
        if not payload:
            raise RuntimeError(f"downloaded zero bytes from {url}")

        temp_path.replace(destination)
        return len(payload), hashlib.sha256(payload).hexdigest(), False
    finally:
        if temp_path.exists():
            temp_path.unlink()


def fetch_one(url, filename, force, label):
    destination = RAW_DIR / filename
    try:
        size, digest, cached = download(url, destination, force)
    except Exception as error:
        print(f"  FAILED {label}: {error}", file=sys.stderr)
        raise

    state = "cached" if cached else "downloaded"
    print(f"  {state:10} {filename}  {human_bytes(size)}  sha256:{digest[:12]}")
    return {
        "raw_path": f"data/raw/{filename}",
        "bytes": size,
        "sha256": digest,
    }


def main():
    force = "--force" in sys.argv
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    retrieved_at = date.today().isoformat()

    manifest_sources = []
    failures = []

    for source in SOURCES:
        print(f"\n{source['id']}")
        try:
            primary = fetch_one(
                source["download_url"], source["raw_filename"], force, source["id"]
            )
        except Exception:
            note = source.get("url_stability_note")
            if note:
                print(f"  note: {note}", file=sys.stderr)
                print(f"  landing page: {source['landing_url']}", file=sys.stderr)
            failures.append(source["id"])
            continue

        extras = []
        for extra in source.get("extra_files", []):
            try:
                fetched = fetch_one(
                    extra["url"], extra["raw_filename"], force, extra["raw_filename"]
                )
            except Exception:
                failures.append(f"{source['id']}:{extra['raw_filename']}")
                continue
            extras.append(
                {
                    "role": extra["role"],
                    "description": extra["description"],
                    "download_url": extra["url"],
                    **fetched,
                }
            )

        manifest_sources.append(
            {
                "id": source["id"],
                "title": source["title"],
                "description": source["description"],
                "destination": source["destination"],
                "axis": source["axis"],
                "format": source["format"],
                "download_url": source["download_url"],
                "landing_url": source["landing_url"],
                "retrieved_at": retrieved_at,
                "publication": source["publication"],
                "source_year": source["source_year"],
                "year_basis": source["year_basis"],
                "methodology": source["methodology"],
                "url_stability_note": source["url_stability_note"],
                **primary,
                "supporting_files": extras,
            }
        )

    manifest = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generated_by": "scripts/fetch-sources.py",
        "note": (
            "Raw files live in data/raw/, which is gitignored and never read "
            "at runtime. Rebuild the curated JSON with "
            "python scripts/build-dataset.py."
        ),
        "sources": manifest_sources,
    }

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {MANIFEST_PATH.relative_to(REPO_ROOT)}  ({len(manifest_sources)} sources)")

    if failures:
        print(f"\n{len(failures)} download(s) failed: {', '.join(failures)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
