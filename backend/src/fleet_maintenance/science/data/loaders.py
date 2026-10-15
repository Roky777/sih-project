from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

FEATURE_NAMES = (
    "setting_1",
    "setting_2",
    "setting_3",
    *(f"sensor_{index}" for index in range(1, 22)),
)


@dataclass(frozen=True)
class CmapssTable:
    identities: tuple[str, ...]
    engine_numbers: NDArray[np.int64]
    cycles: NDArray[np.int64]
    features: NDArray[np.float64]
    feature_names: tuple[str, ...] = FEATURE_NAMES


def load_cmapss_table(path: Path, subset: str, partition: str) -> CmapssTable:
    matrix = np.loadtxt(path, dtype=np.float64)
    if matrix.ndim != 2 or matrix.shape[1] != 26:
        raise ValueError(f"Expected 26 C-MAPSS columns, found shape {matrix.shape}.")
    if not np.isfinite(matrix).all():
        raise ValueError("C-MAPSS input contains non-finite values.")
    raw_engines = matrix[:, 0]
    raw_cycles = matrix[:, 1]
    if not np.equal(raw_engines, np.floor(raw_engines)).all():
        raise ValueError("Engine numbers must be integers.")
    if not np.equal(raw_cycles, np.floor(raw_cycles)).all() or (raw_cycles <= 0).any():
        raise ValueError("Cycles must be positive integers.")
    engines = raw_engines.astype(np.int64)
    if (engines <= 0).any():
        raise ValueError("Engine numbers must be positive integers.")
    cycles = raw_cycles.astype(np.int64)
    for engine in np.unique(engines):
        observed = cycles[engines == engine]
        if not np.array_equal(observed, np.arange(1, len(observed) + 1)):
            raise ValueError(f"Engine {engine} cycles are missing, duplicated, or out of order.")
    identities = tuple(f"NASA_CMAPSS:{subset}:{partition}:{engine}" for engine in engines)
    return CmapssTable(identities, engines, cycles, matrix[:, 2:].copy())


def load_rul_labels(path: Path, expected_engines: int) -> NDArray[np.int64]:
    labels = np.loadtxt(path, dtype=np.float64).reshape(-1)
    if not np.isfinite(labels).all():
        raise ValueError("RUL labels must be finite.")
    if len(labels) != expected_engines:
        raise ValueError(f"Expected {expected_engines} RUL labels, found {len(labels)}.")
    if not np.equal(labels, np.floor(labels)).all() or (labels < 0).any():
        raise ValueError("RUL labels must be nonnegative integer cycles.")
    return labels.astype(np.int64)
