"""Reusable, deterministic scientific manifold and vector validation metrics."""

from __future__ import annotations

import math
from typing import Any, Optional

import numpy as np
from scipy.stats import pearsonr, spearmanr

from app.services.embedding_service import NORM_EPSILON


def deterministic_sample_indices(
    n_total: int, max_samples: int = 500, seed: int = 42
) -> tuple[np.ndarray, bool]:
    """Return full sequential indices up to max_samples, else deterministic seeded subset."""
    if n_total <= max_samples:
        return np.arange(n_total, dtype=np.int64), False
    rng = np.random.default_rng(seed)
    chosen = np.sort(rng.choice(n_total, size=max_samples, replace=False).astype(np.int64))
    return chosen, True


def prepare_neighbor_ranks(distance_matrix: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Precompute sorted neighbor indices (N, N-1) and 1-based rank lookup (N, N)."""
    n = distance_matrix.shape[0]
    order = np.argsort(distance_matrix, axis=1, kind="mergesort")
    nn = np.empty((n, n - 1), dtype=np.int64)
    ranks_table = np.zeros((n, n), dtype=np.int64)
    rank_values = np.arange(1, n, dtype=np.int64)
    for i in range(n):
        row = order[i]
        filtered = row[row != i]
        if len(filtered) != n - 1:
            # Handle degenerate edge case safely if tie/indexing quirk occurred
            filtered = np.array([idx for idx in row if idx != i], dtype=np.int64)[: n - 1]
        nn[i] = filtered
        ranks_table[i, filtered] = rank_values
    return nn, ranks_table


def compute_continuity_and_overlap(
    d_high: np.ndarray,
    d_low: np.ndarray,
    k: int,
    *,
    high_prepared: Optional[tuple[np.ndarray, np.ndarray]] = None,
    low_prepared: Optional[tuple[np.ndarray, np.ndarray]] = None,
) -> dict[str, Any]:
    """Compute Venna & Kaski continuity C(k), trustworthiness T(k), k-NN recall, and Jaccard."""
    n = d_high.shape[0]
    if n < 4 or d_low.shape[0] != n:
        return {
            "status": "unavailable",
            "value": None,
            "sample_size": n,
            "k": k,
            "reason": f"At least 4 valid points are required to evaluate k-NN continuity (got {n}).",
        }
    if not np.all(np.isfinite(d_high)) or not np.all(np.isfinite(d_low)):
        return {
            "status": "unavailable",
            "value": None,
            "sample_size": n,
            "k": k,
            "reason": "Distance matrices contain non-finite (NaN or Inf) values.",
        }

    max_valid_k = (n - 2) // 2
    eff_k = int(k)
    if eff_k < 1 or eff_k > max_valid_k or (2 * n - 3 * eff_k - 1) <= 0:
        return {
            "status": "unavailable",
            "value": None,
            "sample_size": n,
            "k": eff_k,
            "reason": f"Requested k={eff_k} exceeds valid Venna & Kaski bound (1 <= k <= {max(0, max_valid_k)}) for N={n}.",
        }

    nn_high, rank_high = high_prepared or prepare_neighbor_ranks(d_high)
    nn_low, rank_low = low_prepared or prepare_neighbor_ranks(d_low)

    denom = float(n * eff_k * (2 * n - 3 * eff_k - 1))
    t_penalty = 0.0
    c_penalty = 0.0
    recalls: list[float] = []
    jaccards: list[float] = []

    for i in range(n):
        hi_k = set(nn_high[i, :eff_k].tolist())
        lo_k = set(nn_low[i, :eff_k].tolist())
        for j in lo_k - hi_k:
            t_penalty += float(rank_high[i, j] - eff_k)
        for j in hi_k - lo_k:
            c_penalty += float(rank_low[i, j] - eff_k)

        inter = len(hi_k & lo_k)
        union = len(hi_k | lo_k)
        recalls.append(inter / eff_k)
        jaccards.append(inter / union if union > 0 else 1.0)

    trust = max(0.0, min(1.0, 1.0 - (2.0 / denom) * t_penalty))
    continuity = max(0.0, min(1.0, 1.0 - (2.0 / denom) * c_penalty))
    return {
        "status": "computed",
        "value": round(float(continuity), 6),
        "continuity": round(float(continuity), 6),
        "trustworthiness": round(float(trust), 6),
        "knn_recall": round(float(np.mean(recalls)), 6),
        "knn_jaccard": round(float(np.mean(jaccards)), 6),
        "sample_size": n,
        "k": eff_k,
        "reason": None,
    }


def compute_2d_vs_3d_overlap(
    d_2d: np.ndarray,
    d_3d: np.ndarray,
    k: int,
    *,
    prep_2d: Optional[tuple[np.ndarray, np.ndarray]] = None,
    prep_3d: Optional[tuple[np.ndarray, np.ndarray]] = None,
    point_ids: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Compare Euclidean top-k nearest neighbors directly between 2D and 3D projected spaces."""
    n = d_2d.shape[0]
    if n < 2 or d_3d.shape[0] != n:
        return {
            "status": "unavailable",
            "value": None,
            "sample_size": n,
            "k": k,
            "reason": f"At least 2 points are required for neighborhood overlap (got {n}).",
        }
    if not np.all(np.isfinite(d_2d)) or not np.all(np.isfinite(d_3d)):
        return {
            "status": "unavailable",
            "value": None,
            "sample_size": n,
            "k": k,
            "reason": "Projected coordinate distance matrices contain non-finite values.",
        }

    eff_k = min(int(k), n - 1)
    if eff_k < 1:
        return {
            "status": "unavailable",
            "value": None,
            "sample_size": n,
            "k": k,
            "reason": f"Neighborhood size k={k} must be >= 1.",
        }

    nn_2d, _ = prep_2d or prepare_neighbor_ranks(d_2d)
    nn_3d, _ = prep_3d or prepare_neighbor_ranks(d_3d)

    overlaps: list[tuple[int, float, float]] = []
    for i in range(n):
        s2 = set(nn_2d[i, :eff_k].tolist())
        s3 = set(nn_3d[i, :eff_k].tolist())
        inter = len(s2 & s3)
        union = len(s2 | s3)
        ov_rate = inter / eff_k
        jac = inter / union if union > 0 else 1.0
        overlaps.append((i, ov_rate, jac))

    ov_vals = [row[1] for row in overlaps]
    jac_vals = [row[2] for row in overlaps]
    sorted_by_ov = sorted(overlaps, key=lambda item: (item[1], item[2], item[0]))
    pick_positions = [0, len(sorted_by_ov) // 2, len(sorted_by_ov) - 1]
    seen_pos: set[int] = set()
    examples: list[dict[str, Any]] = []
    for pos in pick_positions:
        if pos in seen_pos:
            continue
        seen_pos.add(pos)
        idx, ov_rate, jac = sorted_by_ov[pos]
        pid = point_ids[idx] if point_ids and idx < len(point_ids) else f"point_{idx}"
        examples.append(
            {
                "id": pid,
                "overlap_rate": round(float(ov_rate), 6),
                "jaccard": round(float(jac), 6),
            }
        )

    return {
        "status": "computed",
        "value": round(float(np.mean(ov_vals)), 6),
        "mean_jaccard": round(float(np.mean(jac_vals)), 6),
        "min_overlap": round(float(np.min(ov_vals)), 6),
        "max_overlap": round(float(np.max(ov_vals)), 6),
        "sample_size": n,
        "k": eff_k,
        "point_examples": examples,
        "reason": None,
    }


def compute_projection_distortion(
    d_high_tri: np.ndarray, d_low_tri: np.ndarray, sample_size: int
) -> dict[str, Any]:
    """Compute Spearman rho, Pearson r, and Kruskal Stress-1 over pairwise upper-triangle distances."""
    pair_count = int(len(d_high_tri))
    if sample_size < 3 or pair_count < 3 or len(d_low_tri) != pair_count:
        return {
            "status": "unavailable",
            "value": None,
            "spearman_correlation": None,
            "pearson_correlation": None,
            "kruskal_stress_1": None,
            "pair_count": pair_count,
            "sample_size": sample_size,
            "reason": f"At least 3 pairwise distance entries are required (got {pair_count}).",
        }
    if not np.all(np.isfinite(d_high_tri)) or not np.all(np.isfinite(d_low_tri)):
        return {
            "status": "unavailable",
            "value": None,
            "spearman_correlation": None,
            "pearson_correlation": None,
            "kruskal_stress_1": None,
            "pair_count": pair_count,
            "sample_size": sample_size,
            "reason": "Pairwise distance array contains non-finite values.",
        }
    if float(np.std(d_high_tri)) <= 1e-12 or float(np.std(d_low_tri)) <= 1e-12:
        return {
            "status": "unavailable",
            "value": None,
            "spearman_correlation": None,
            "pearson_correlation": None,
            "kruskal_stress_1": None,
            "pair_count": pair_count,
            "sample_size": sample_size,
            "reason": "Zero variance in pairwise distances prevents correlation estimation.",
        }

    sp = float(spearmanr(d_high_tri, d_low_tri).statistic)
    pr = float(pearsonr(d_high_tri, d_low_tri).statistic)
    denom_low = float(np.dot(d_low_tri, d_low_tri))
    denom_high = float(np.dot(d_high_tri, d_high_tri))
    scale = float(np.dot(d_high_tri, d_low_tri)) / denom_low if denom_low > 0 else 1.0
    stress = (
        math.sqrt(float(np.sum((d_high_tri - scale * d_low_tri) ** 2)) / denom_high)
        if denom_high > 0
        else None
    )

    if not math.isfinite(sp) or stress is None or not math.isfinite(stress):
        return {
            "status": "unavailable",
            "value": None,
            "spearman_correlation": None,
            "pearson_correlation": None,
            "kruskal_stress_1": None,
            "pair_count": pair_count,
            "sample_size": sample_size,
            "reason": "Correlation or Kruskal Stress-1 produced non-finite output.",
        }

    return {
        "status": "computed",
        "value": round(sp, 6),
        "spearman_correlation": round(sp, 6),
        "pearson_correlation": round(pr, 6) if math.isfinite(pr) else None,
        "kruskal_stress_1": round(stress, 6),
        "pair_count": pair_count,
        "sample_size": sample_size,
        "reason": None,
    }


def validate_unit_norm_vectors(
    vectors: list[np.ndarray],
    *,
    expected_dim: int = 384,
    tolerance: float = 1e-4,
    labels: Optional[list[str]] = None,
    strengths: Optional[list[Optional[float]]] = None,
) -> dict[str, Any]:
    """Audit raw vector L2 norms without mutating or silently normalizing invalid embeddings."""
    total_tested = len(vectors)
    if total_tested == 0:
        return {
            "status": "unavailable",
            "value": None,
            "valid_count": 0,
            "invalid_count": 0,
            "total_tested": 0,
            "tolerance": tolerance,
            "min_norm": None,
            "max_norm": None,
            "max_deviation": None,
            "nan_count": 0,
            "inf_count": 0,
            "zero_vector_count": 0,
            "wrong_dim_count": 0,
            "checks": [],
            "reason": "No vectors supplied for unit-norm validation.",
        }

    valid_count = 0
    invalid_count = 0
    nan_count = 0
    inf_count = 0
    zero_vector_count = 0
    wrong_dim_count = 0
    finite_norms: list[float] = []
    deviations: list[float] = []
    checks: list[dict[str, Any]] = []

    for idx, vec in enumerate(vectors):
        arr = np.asarray(vec)
        lbl = labels[idx] if labels and idx < len(labels) else f"vector_{idx}"
        strength = strengths[idx] if strengths and idx < len(strengths) else None

        if arr.ndim != 1 or arr.shape[0] != expected_dim:
            wrong_dim_count += 1
            invalid_count += 1
            checks.append(
                {
                    "label": lbl,
                    "strength": strength,
                    "norm": None,
                    "deviation": None,
                    "is_valid": False,
                    "issue": f"wrong_dimensionality:{arr.shape}",
                }
            )
            continue

        arr_f64 = arr.astype(np.float64, copy=False)
        has_nan = bool(np.any(np.isnan(arr_f64)))
        has_inf = bool(np.any(np.isinf(arr_f64)))
        if has_nan or has_inf:
            if has_nan:
                nan_count += 1
            if has_inf:
                inf_count += 1
            invalid_count += 1
            issues = [flag for flag, hit in (("nan_values", has_nan), ("inf_values", has_inf)) if hit]
            checks.append(
                {
                    "label": lbl,
                    "strength": strength,
                    "norm": None,
                    "deviation": None,
                    "is_valid": False,
                    "issue": ",".join(issues),
                }
            )
            continue

        norm = float(math.sqrt(float(np.sum(arr_f64 * arr_f64))))
        deviation = abs(norm - 1.0)
        finite_norms.append(norm)
        deviations.append(deviation)

        if norm <= NORM_EPSILON:
            zero_vector_count += 1
            invalid_count += 1
            checks.append(
                {
                    "label": lbl,
                    "strength": strength,
                    "norm": round(norm, 8),
                    "deviation": round(deviation, 8),
                    "is_valid": False,
                    "issue": "zero_vector",
                }
            )
            continue

        is_valid = deviation <= tolerance
        if is_valid:
            valid_count += 1
        else:
            invalid_count += 1

        checks.append(
            {
                "label": lbl,
                "strength": strength,
                "norm": round(norm, 8),
                "deviation": round(deviation, 8),
                "is_valid": is_valid,
                "issue": None if is_valid else f"norm_deviation>{tolerance}",
            }
        )

    status = "passed" if invalid_count == 0 else "failed"
    return {
        "status": status,
        "value": round(float(valid_count / total_tested), 6),
        "valid_count": valid_count,
        "invalid_count": invalid_count,
        "total_tested": total_tested,
        "tolerance": float(tolerance),
        "min_norm": round(float(min(finite_norms)), 8) if finite_norms else None,
        "max_norm": round(float(max(finite_norms)), 8) if finite_norms else None,
        "max_deviation": round(float(max(deviations)), 8) if deviations else None,
        "nan_count": nan_count,
        "inf_count": inf_count,
        "zero_vector_count": zero_vector_count,
        "wrong_dim_count": wrong_dim_count,
        "checks": checks,
        "reason": None,
    }
