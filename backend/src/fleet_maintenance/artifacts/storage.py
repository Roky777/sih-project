"""Verify administrator-installed artifacts before any executable model deserialization."""

import hashlib
from pathlib import Path


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def artifact_directory(root: Path, relative: str) -> Path:
    directory = (root / relative).resolve()
    if not directory.is_relative_to(root.resolve()) or directory == root.resolve():
        raise ValueError("Artifact directory must be within the configured artifact root")
    return directory


def verify_hashes(directory: Path, hashes: dict[str, str]) -> None:
    for name, expected in hashes.items():
        path = (directory / name).resolve()
        if not path.is_relative_to(directory.resolve()) or not path.is_file():
            raise ValueError("Artifact file is missing or outside its directory")
        if sha256(path) != expected:
            raise ValueError(f"Artifact hash mismatch: {name}")
