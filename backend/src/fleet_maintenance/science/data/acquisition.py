"""Allowlisted NASA acquisition with pinned archive identity and non-overwriting extraction."""

import hashlib
import io
import json
import tempfile
import urllib.request
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SOURCE_URL = (
    "https://phm-datasets.s3.amazonaws.com/NASA/"
    "6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip"
)
ARCHIVE_SHA256 = "c9c5dec12a945a82e8bb4446589d7fb3cc057b5e5d81fa1a12e25ee9912ad3b2"
NESTED_SHA256 = "74bef434a34db25c7bf72e668ea4cd52afe5f2cf8e44367c55a82bfd91a5a34f"
OUTER_MEMBER = "6. Turbofan Engine Degradation Simulation Data Set/CMAPSSData.zip"
SUBSETS = ("FD001", "FD002", "FD003", "FD004")


def extract_verified(archive: bytes, destination: Path, subsets: tuple[str, ...]) -> dict[str, Any]:
    if not subsets or len(set(subsets)) != len(subsets) or not set(subsets) <= set(SUBSETS):
        raise ValueError("Select distinct supported C-MAPSS subsets")
    if hashlib.sha256(archive).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("NASA archive differs from the retained source hash; review before use")
    with zipfile.ZipFile(io.BytesIO(archive)) as outer:
        nested = outer.read(OUTER_MEMBER)
    if hashlib.sha256(nested).hexdigest() != NESTED_SHA256:
        raise ValueError("Nested C-MAPSS archive hash mismatch")
    required = {"readme.txt"} | {
        f"{part}_{subset}.txt" for subset in subsets for part in ("train", "test", "RUL")
    }
    with zipfile.ZipFile(io.BytesIO(nested)) as bundle:
        payloads = {name: bundle.read(name) for name in sorted(required)}
    # Validate every existing file before writing any member. Historical FD001 bytes stay intact.
    for name, payload in payloads.items():
        path = destination / name
        if path.exists() and path.read_bytes() != payload:
            raise ValueError(f"Refusing to overwrite conflicting source file: {name}")
    destination.mkdir(parents=True, exist_ok=True)
    for name, payload in payloads.items():
        path = destination / name
        if not path.exists():
            with path.open("xb") as target:
                target.write(payload)
    manifest = {
        "dataset": "NASA C-MAPSS", "subsets": list(subsets), "simulated": True,
        "source_url": SOURCE_URL, "acquired_at": datetime.now(UTC).isoformat(),
        "archive_sha256": ARCHIVE_SHA256, "nested_archive_sha256": NESTED_SHA256,
        "files": {name: hashlib.sha256(value).hexdigest() for name, value in payloads.items()},
        "license_note": "NASA portal lists the license as not specified.",
    }
    ledger = destination / f"acquisition-{'-'.join(subsets)}.json"
    if ledger.exists():
        old = json.loads(ledger.read_text())
        if old.get("files") != manifest["files"]:
            raise ValueError("Existing acquisition ledger conflicts with verified source files")
        return dict(old)
    ledger.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return manifest


def acquire_cmapss(destination: Path, subsets: tuple[str, ...]) -> dict[str, Any]:
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "PS26249-research/1"})
    with tempfile.TemporaryFile() as target:
        with urllib.request.urlopen(request, timeout=120) as response:
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > 100 * 1024 * 1024:
                    raise ValueError("Unexpectedly large NASA archive")
                target.write(chunk)
        target.seek(0)
        return extract_verified(target.read(), destination, subsets)
