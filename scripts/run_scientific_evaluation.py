"""Reproducible scientific evaluation & baseline benchmark suite for VectiQ.

Evaluates the three mandatory Resurrect 2026 Problem 5 goals against the real local
backend engine (`sentence-transformers/all-MiniLM-L6-v2`, 360-sentence corpus,
contrastive directions, and fitted 3D UMAP) without mutating backend behavior or artifacts:
  1. Steering controllability & predictability (alignment, monotonicity, 95% CI, random control,
     attribute specificity across positive_sentiment, technical_tone, formal_tone).
  2. Embedding preservation (zero-strength identity, cosine preservation, 384D k-NN preservation,
     norm validation, semantic drift, orthogonal content vs. cross-concept preservation).
  3. Visualization fidelity (384D vs. 3D UMAP, 2D (x, y) UI slice, and dedicated 2D UMAP control
     measured by Trustworthiness, Continuity, k-NN recall/Jaccard, Kruskal Stress-1, Spearman/Pearson,
     query-level neighbor agreement, and batch-vs-single transform invariance).
  4. Section 8 edge-case & invalid-input validation probes.

Usage (from repository root on Windows):
    .\\backend\\venv\\Scripts\\python.exe scripts\\run_scientific_evaluation.py
"""

from __future__ import annotations

import argparse
import inspect
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import umap
from pydantic import ValidationError
from scipy.stats import pearsonr, spearmanr
from sklearn.manifold import trustworthiness as sklearn_trustworthiness
from sklearn.metrics import pairwise_distances, roc_auc_score
from sklearn.model_selection import StratifiedKFold

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.models.schemas import ConceptEnum, EvaluateRequest, SteerRequest  # noqa: E402
from app.services.container import ServiceContainer  # noqa: E402
from app.services.embedding_service import (  # noqa: E402
    safe_cosine_similarity,
    safe_l2_normalize,
)

# 24 held-out evaluation sentences distinct from backend/data/corpus.csv
HELD_OUT_SENTENCES: list[str] = [
    "The software release finished smoothly ahead of schedule.",
    "Our deployment failed repeatedly due to unresolved configuration errors.",
    "The meeting covered quarterly milestones and team staffing updates.",
    "Could you please forward the signed contract before Friday afternoon?",
    "Hey, wanna grab some coffee after we wrap up today?",
    "The distributed consensus protocol bounds tail latency under partition faults.",
    "Students explored how cosine similarity groups semantically related passages.",
    "Operating margins expanded across European enterprise accounts this quarter.",
    "Customer support wait times increased sharply during the holiday rush.",
    "Everything worked seamlessly and the team celebrated the launch.",
    "Pursuant to Section 8, all external audits must conclude within thirty days.",
    "Just tweaking a couple small settings so the dashboard loads faster.",
    "Gradient clipping prevents exploding updates in deep recurrent architectures.",
    "I felt deeply grateful for my colleague's thoughtful review comments.",
    "The printer jammed twice and ruined our morning presentation prep.",
    "Board members requested a consolidated risk assessment for Q4.",
    "Kids built simple paper rockets in the afternoon science workshop.",
    "Vector quantization reduces memory bandwidth while preserving recall.",
    "The flight was delayed three hours with zero communication from staff.",
    "Thank you for your prompt assistance and detailed explanation.",
    "Basically you press that button and the chart updates automatically.",
    "Eigenvalue decomposition reveals the principal variance directions.",
    "Let's catch up tomorrow morning once everyone settles in.",
    "Compliance documentation requires dual signatures from legal counsel.",
]

EVAL_STRENGTHS = [-1.0, -0.75, -0.5, -0.25, 0.0, 0.25, 0.5, 0.75, 1.0]


def _ci95(vals: list[float] | np.ndarray) -> float:
    arr = np.asarray(vals, dtype=np.float64)
    if len(arr) <= 1:
        return 0.0
    return float(1.96 * np.std(arr, ddof=1) / math.sqrt(len(arr)))


def _summarize(vals: list[float] | np.ndarray) -> dict[str, float]:
    arr = np.asarray(vals, dtype=np.float64)
    return {
        "mean": round(float(np.mean(arr)), 4),
        "std": round(float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0, 4),
        "ci95": round(_ci95(arr), 4),
        "min": round(float(np.min(arr)), 4),
        "max": round(float(np.max(arr)), 4),
    }


def compute_projection_fidelity(
    d_high: np.ndarray, d_low: np.ndarray, k: int
) -> tuple[float, float, float, float]:
    """Return (trustworthiness, continuity, mean_knn_recall, mean_knn_jaccard) at neighbor size k."""
    n = d_high.shape[0]
    order_high = np.argsort(d_high, axis=1, kind="mergesort")
    order_low = np.argsort(d_low, axis=1, kind="mergesort")

    nn_high = np.empty((n, n - 1), dtype=np.int64)
    nn_low = np.empty((n, n - 1), dtype=np.int64)
    for i in range(n):
        nn_high[i] = [idx for idx in order_high[i] if idx != i]
        nn_low[i] = [idx for idx in order_low[i] if idx != i]

    rank_high = np.empty((n, n), dtype=np.int64)
    rank_low = np.empty((n, n), dtype=np.int64)
    ranks = np.arange(1, n, dtype=np.int64)
    for i in range(n):
        rank_high[i, nn_high[i]] = ranks
        rank_low[i, nn_low[i]] = ranks

    denom = float(n * k * (2 * n - 3 * k - 1))
    t_penalty = 0.0
    c_penalty = 0.0
    recalls: list[float] = []
    jaccards: list[float] = []

    for i in range(n):
        hi_k = set(nn_high[i, :k].tolist())
        lo_k = set(nn_low[i, :k].tolist())

        for j in lo_k - hi_k:
            t_penalty += rank_high[i, j] - k
        for j in hi_k - lo_k:
            c_penalty += rank_low[i, j] - k

        inter = len(hi_k & lo_k)
        union = len(hi_k | lo_k)
        recalls.append(inter / k)
        jaccards.append(inter / union if union else 1.0)

    trust = 1.0 - (2.0 / denom) * t_penalty
    cont = 1.0 - (2.0 / denom) * c_penalty
    return float(trust), float(cont), float(np.mean(recalls)), float(np.mean(jaccards))


def compute_kruskal_stress_1(d_high_tri: np.ndarray, d_low_tri: np.ndarray) -> float:
    """Compute normalized Kruskal Stress-1 with optimal linear distance scaling."""
    denom = float(np.dot(d_low_tri, d_low_tri))
    scale = float(np.dot(d_high_tri, d_low_tri)) / denom if denom > 0 else 1.0
    return float(
        np.sqrt(np.sum((d_high_tri - scale * d_low_tri) ** 2) / np.sum(d_high_tri**2))
    )


def run_benchmark() -> dict[str, Any]:
    """Execute the full scientific evaluation suite and return structured results."""
    t0 = time.time()
    settings = get_settings()
    container = ServiceContainer(settings)
    container.initialize(save_artifacts=False)

    ds = container.dataset_service
    es = container.embedding_service
    ss = container.steering_service
    sms = container.semantic_map_service
    sim = container.similarity_service
    ev = container.evaluation_service

    emb = sms.corpus_embeddings
    coords_3d = sms.corpus_coords_3d
    assert emb is not None and coords_3d is not None
    coords_2d_slice = coords_3d[:, :2]

    # 1. Corpus & anchor composition
    category_counts: dict[str, int] = {}
    for rec in ds.records:
        category_counts[rec.category] = category_counts.get(rec.category, 0) + 1

    anchors: dict[str, dict[str, int]] = {}
    for c in ConceptEnum:
        pos_idx, neg_idx = ds.get_concept_anchor_indices(c)
        anchors[c.value] = {"positive": len(pos_idx), "negative": len(neg_idx)}

    sim_matrix = emb @ emb.T
    np.fill_diagonal(sim_matrix, 0.0)
    near_dups = int(np.sum(np.triu(sim_matrix, 1) >= 0.85))

    # 2. Embedding cluster cohesion
    cats = np.array([r.category for r in ds.records])
    tri_i, tri_j = np.triu_indices(len(emb), k=1)
    same_mask = cats[tri_i] == cats[tri_j]
    intra_sims = sim_matrix[tri_i[same_mask], tri_j[same_mask]]
    inter_sims = sim_matrix[tri_i[~same_mask], tri_j[~same_mask]]

    # 3. 5-fold cross-validated anchor direction generalization
    cv_results: dict[str, dict[str, float]] = {}
    for c in ConceptEnum:
        pos_idx, neg_idx = ds.get_concept_anchor_indices(c)
        idx_all = np.array(pos_idx + neg_idx)
        y_all = np.array([1] * len(pos_idx) + [0] * len(neg_idx))
        skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        aucs, accs, gaps = [], [], []
        for tr, te in skf.split(idx_all, y_all):
            tr_pos = idx_all[tr][y_all[tr] == 1]
            tr_neg = idx_all[tr][y_all[tr] == 0]
            d_fold = safe_l2_normalize(
                (emb[tr_pos].mean(axis=0) - emb[tr_neg].mean(axis=0)).astype(np.float32)
            )
            te_scores = emb[idx_all[te]] @ d_fold
            y_te = y_all[te]
            aucs.append(float(roc_auc_score(y_te, te_scores)))
            accs.append(float(np.mean((te_scores >= 0.0) == (y_te == 1))))
            gaps.append(float(te_scores[y_te == 1].mean() - te_scores[y_te == 0].mean()))
        cv_results[c.value] = {
            "roc_auc_mean": round(float(np.mean(aucs)), 4),
            "roc_auc_std": round(float(np.std(aucs)), 4),
            "accuracy_at_zero": round(float(np.mean(accs)), 4),
            "pole_score_gap": round(float(np.mean(gaps)), 4),
        }

    # 4. Cross-concept axis orthogonality
    concepts = list(ConceptEnum)
    direction_alignment: dict[str, float] = {}
    for i in range(len(concepts)):
        for j in range(i + 1, len(concepts)):
            key = f"{concepts[i].value}__vs__{concepts[j].value}"
            direction_alignment[key] = round(
                safe_cosine_similarity(ss.directions[concepts[i]], ss.directions[concepts[j]]),
                4,
            )

    # 5. Goal 1 & Goal 2 held-out benchmark (N=24) with random unit-vector controls
    rng = np.random.default_rng(42)
    rand_dirs = {
        c: safe_l2_normalize(rng.normal(0.0, 1.0, size=384).astype(np.float32))
        for c in ConceptEnum
    }

    zero_identity_diffs: list[float] = []
    norm_deviations: list[float] = []
    non_finite_count = 0
    goal1_results: dict[str, Any] = {}
    goal2_results: dict[str, Any] = {}
    specificity_matrix: dict[str, Any] = {}

    for c in ConceptEnum:
        d_c = ss.directions[c]
        step_buckets: dict[str, dict[str, list[float]]] = {
            str(s): {
                "delta": [],
                "disp_align": [],
                "pres_cos": [],
                "ortho_cos": [],
                "euclid_384d": [],
                "angle_deg": [],
                "jaccard_k5": [],
                "recall_k5": [],
                "jaccard_k15": [],
                "recall_k15": [],
            }
            for s in EVAL_STRENGTHS
        }
        mono_flags, rhos, pearsons, r2s = [], [], [], []
        rand_deltas_10, rand_pres_10, rand_rhos = [], [], []
        cross_deltas_08: dict[str, list[float]] = {o.value: [] for o in ConceptEnum}
        cross_deltas_10: dict[str, list[float]] = {o.value: [] for o in ConceptEnum}

        for txt in HELD_OUT_SENTENCES:
            orig = es.encode_text(txt)
            base_scores = ss.compute_all_concept_scores(orig)
            base_k5 = {
                n.id
                for n in sim.find_nearest_neighbors(
                    query_embedding=orig,
                    records=ds.records,
                    corpus_embeddings=emb,
                    corpus_coords_3d=coords_3d,
                    top_k=5,
                    exclude_text=txt,
                )
            }
            base_k15 = {
                n.id
                for n in sim.find_nearest_neighbors(
                    query_embedding=orig,
                    records=ds.records,
                    corpus_embeddings=emb,
                    corpus_coords_3d=coords_3d,
                    top_k=15,
                    exclude_text=txt,
                )
            }
            e_perp_orig = orig - np.dot(orig, d_c) * d_c
            sweep_scores = []

            for s in EVAL_STRENGTHS:
                steered = ss.steer_embedding(orig, c, s)
                if not np.all(np.isfinite(steered)):
                    non_finite_count += 1
                norm_deviations.append(abs(float(np.linalg.norm(steered)) - 1.0))
                if s == 0.0:
                    zero_identity_diffs.append(float(np.linalg.norm(steered - orig)))

                sc = ss.compute_concept_score(steered, c)
                sweep_scores.append(sc)
                pres = safe_cosine_similarity(orig, steered)
                euc = float(np.linalg.norm(steered - orig))
                ang = float(math.degrees(math.acos(max(-1.0, min(1.0, pres)))))
                e_perp_st = steered - np.dot(steered, d_c) * d_c
                ortho_pres = safe_cosine_similarity(e_perp_orig, e_perp_st)
                disp_align = (
                    1.0
                    if s == 0.0
                    else safe_cosine_similarity(steered - orig, d_c if s > 0 else -d_c)
                )

                k5 = {
                    n.id
                    for n in sim.find_nearest_neighbors(
                        query_embedding=steered,
                        records=ds.records,
                        corpus_embeddings=emb,
                        corpus_coords_3d=coords_3d,
                        top_k=5,
                        exclude_text=txt,
                    )
                }
                k15 = {
                    n.id
                    for n in sim.find_nearest_neighbors(
                        query_embedding=steered,
                        records=ds.records,
                        corpus_embeddings=emb,
                        corpus_coords_3d=coords_3d,
                        top_k=15,
                        exclude_text=txt,
                    )
                }

                bucket = step_buckets[str(s)]
                bucket["delta"].append(sc - base_scores[c])
                bucket["disp_align"].append(disp_align)
                bucket["pres_cos"].append(pres)
                bucket["ortho_cos"].append(ortho_pres)
                bucket["euclid_384d"].append(euc)
                bucket["angle_deg"].append(ang)
                bucket["jaccard_k5"].append(len(base_k5 & k5) / len(base_k5 | k5))
                bucket["recall_k5"].append(len(base_k5 & k5) / 5.0)
                bucket["jaccard_k15"].append(len(base_k15 & k15) / len(base_k15 | k15))
                bucket["recall_k15"].append(len(base_k15 & k15) / 15.0)

                if s == 1.0:
                    all_st = ss.compute_all_concept_scores(steered)
                    for o in ConceptEnum:
                        cross_deltas_10[o.value].append(all_st[o] - base_scores[o])

            st_08 = ss.steer_embedding(orig, c, 0.8)
            all_st08 = ss.compute_all_concept_scores(st_08)
            for o in ConceptEnum:
                cross_deltas_08[o.value].append(all_st08[o] - base_scores[o])

            mono_flags.append(
                1.0
                if all(
                    sweep_scores[i + 1] >= sweep_scores[i] - 1e-6
                    for i in range(len(sweep_scores) - 1)
                )
                else 0.0
            )
            sp = float(spearmanr(EVAL_STRENGTHS, sweep_scores).statistic)
            pr = float(pearsonr(EVAL_STRENGTHS, sweep_scores).statistic)
            rhos.append(sp)
            pearsons.append(pr)
            r2s.append(pr * pr)

            r_scores = []
            for s in EVAL_STRENGTHS:
                er = (
                    orig.copy()
                    if s == 0.0
                    else safe_l2_normalize((orig + np.float32(s) * rand_dirs[c]).astype(np.float32))
                )
                r_scores.append(ss.compute_concept_score(er, c))
                if s == 1.0:
                    rand_deltas_10.append(r_scores[-1] - base_scores[c])
                    rand_pres_10.append(safe_cosine_similarity(orig, er))
            rand_rhos.append(float(spearmanr(EVAL_STRENGTHS, r_scores).statistic))

        goal1_results[c.value] = {
            "sample_size": len(HELD_OUT_SENTENCES),
            "direction_norm": round(float(np.linalg.norm(d_c)), 8),
            "monotonicity_rate": round(float(np.mean(mono_flags)), 4),
            "spearman_rho": _summarize(rhos),
            "pearson_r": _summarize(pearsons),
            "linearity_r2": _summarize(r2s),
            "random_control_delta_plus_1": _summarize(rand_deltas_10),
            "random_control_preservation_plus_1": _summarize(rand_pres_10),
            "random_control_spearman": _summarize(rand_rhos),
            "by_strength": {
                k_s: {
                    "delta": _summarize(v["delta"]),
                    "displacement_cosine": _summarize(v["disp_align"]),
                }
                for k_s, v in step_buckets.items()
            },
        }
        goal2_results[c.value] = {
            "by_strength": {
                k_s: {
                    "preservation_cosine": _summarize(v["pres_cos"]),
                    "orthogonal_content_cosine": _summarize(v["ortho_cos"]),
                    "euclid_384d": _summarize(v["euclid_384d"]),
                    "angle_deg": _summarize(v["angle_deg"]),
                    "jaccard_k5": _summarize(v["jaccard_k5"]),
                    "recall_k5": _summarize(v["recall_k5"]),
                    "jaccard_k15": _summarize(v["jaccard_k15"]),
                    "recall_k15": _summarize(v["recall_k15"]),
                }
                for k_s, v in step_buckets.items()
            }
        }
        specificity_matrix[c.value] = {
            "at_plus_0_8": {k: _summarize(vals) for k, vals in cross_deltas_08.items()},
            "at_plus_1_0": {k: _summarize(vals) for k, vals in cross_deltas_10.items()},
        }

    # Repeatability check across 3 runs
    rep_emb_diffs, rep_steer_diffs, rep_umap_diffs = [], [], []
    for txt in HELD_OUT_SENTENCES[:5]:
        embs = [es.encode_text(txt) for _ in range(3)]
        steers = [ss.steer_embedding(embs[0], ConceptEnum.technical_tone, 0.75) for _ in range(3)]
        coords_rep = [sms.transform_vector(steers[0]) for _ in range(3)]
        for r in range(1, 3):
            rep_emb_diffs.append(float(np.linalg.norm(embs[r] - embs[0])))
            rep_steer_diffs.append(float(np.linalg.norm(steers[r] - steers[0])))
            rep_umap_diffs.append(
                float(
                    math.dist(
                        (coords_rep[r].x, coords_rep[r].y, coords_rep[r].z),
                        (coords_rep[0].x, coords_rep[0].y, coords_rep[0].z),
                    )
                )
            )

    # 6. Goal 3: 3D UMAP vs. 2D (x, y) slice vs. dedicated 2D UMAP control
    d384_cos = pairwise_distances(emb, metric="cosine")
    d384_euc = pairwise_distances(emb, metric="euclidean")
    d3d = pairwise_distances(coords_3d, metric="euclidean")
    d2d_slice = pairwise_distances(coords_2d_slice, metric="euclidean")

    umap2_kwargs: dict[str, Any] = {
        "n_components": 2,
        "n_neighbors": settings.umap_n_neighbors,
        "min_dist": settings.umap_min_dist,
        "metric": settings.umap_metric,
        "random_state": settings.umap_random_state,
        "n_jobs": 1,
    }
    if "compatibility_layout" in inspect.signature(umap.UMAP.__init__).parameters:
        umap2_kwargs["compatibility_layout"] = True
    coords_2d_fitted = np.asarray(umap.UMAP(**umap2_kwargs).fit_transform(emb), dtype=np.float32)
    d2d_fitted = pairwise_distances(coords_2d_fitted, metric="euclidean")

    t15_custom, _, _, _ = compute_projection_fidelity(d384_cos, d3d, 15)
    t15_sklearn = float(
        sklearn_trustworthiness(
            emb.astype(np.float64),
            coords_3d.astype(np.float64),
            n_neighbors=15,
            metric="cosine",
        )
    )
    tri = np.triu_indices(len(emb), k=1)

    projection_comparison: dict[str, Any] = {
        "trustworthiness_15_custom_vs_sklearn_diff": round(abs(t15_custom - t15_sklearn), 10)
    }
    for label, d_low in [
        ("3d_umap", d3d),
        ("2d_xy_slice_used_in_ui", d2d_slice),
        ("2d_dedicated_umap_control", d2d_fitted),
    ]:
        by_k = {}
        for k in (5, 10, 15, 30):
            t, c_val, rec, jac = compute_projection_fidelity(d384_cos, d_low, k)
            by_k[str(k)] = {
                "trustworthiness": round(t, 6),
                "continuity": round(c_val, 6),
                "knn_recall": round(rec, 6),
                "knn_jaccard": round(jac, 6),
            }
        projection_comparison[label] = {
            "by_k": by_k,
            "global_spearman_cos384": round(float(spearmanr(d384_cos[tri], d_low[tri]).statistic), 4),
            "global_pearson_cos384": round(float(pearsonr(d384_cos[tri], d_low[tri]).statistic), 4),
            "global_spearman_euc384": round(float(spearmanr(d384_euc[tri], d_low[tri]).statistic), 4),
            "global_pearson_euc384": round(float(pearsonr(d384_euc[tri], d_low[tri]).statistic), 4),
            "kruskal_stress1_cos384": round(compute_kruskal_stress_1(d384_cos[tri], d_low[tri]), 4),
            "kruskal_stress1_euc384": round(compute_kruskal_stress_1(d384_euc[tri], d_low[tri]), 4),
        }

    knn_query_3d, knn_query_2d = [], []
    steer_batch_orig_shifts, eval_batch_zero_shifts = [], []
    for txt in HELD_OUT_SENTENCES:
        e0 = es.encode_text(txt)
        c_single = sms.transform_vector(e0)
        p0 = np.array([c_single.x, c_single.y, c_single.z], dtype=np.float64)

        top5_384d = set(np.argsort(-(emb @ e0))[:5].tolist())
        top5_3d = set(np.argsort(np.linalg.norm(coords_3d - p0, axis=1))[:5].tolist())
        top5_2d = set(np.argsort(np.linalg.norm(coords_2d_slice - p0[:2], axis=1))[:5].tolist())
        knn_query_3d.append(len(top5_384d & top5_3d) / 5.0)
        knn_query_2d.append(len(top5_384d & top5_2d) / 5.0)

        e_st = ss.steer_embedding(e0, ConceptEnum.positive_sentiment, 0.75)
        c_batch = sms.transform_batch(np.stack([e0, e_st], axis=0))
        steer_batch_orig_shifts.append(
            float(math.dist((c_single.x, c_single.y, c_single.z), (c_batch[0].x, c_batch[0].y, c_batch[0].z)))
        )

        sweep_mat = np.stack(
            [ss.steer_embedding(e0, ConceptEnum.positive_sentiment, s) for s in EVAL_STRENGTHS],
            axis=0,
        )
        c_eval_batch = sms.transform_batch(sweep_mat)
        zero_idx = EVAL_STRENGTHS.index(0.0)
        eval_batch_zero_shifts.append(
            float(
                math.dist(
                    (c_single.x, c_single.y, c_single.z),
                    (c_eval_batch[zero_idx].x, c_eval_batch[zero_idx].y, c_eval_batch[zero_idx].z),
                )
            )
        )

    # 7. Edge cases & invalid guards
    edge_cases: dict[str, Any] = {}
    edge_cases["very_short"] = [
        {
            "text": s_txt,
            "base_score": ev.evaluate(
                text=s_txt, concept=ConceptEnum.positive_sentiment, strengths=EVAL_STRENGTHS
            ).base_concept_score,
            "r2": ev.evaluate(
                text=s_txt, concept=ConceptEnum.positive_sentiment, strengths=EVAL_STRENGTHS
            ).metrics_summary.linearity_score,
        }
        for s_txt in ("Hi", "Ok", ".")
    ]

    base_crash = es.encode_text("critical database crash")
    near_1000_chars = ("a " * 490) + "crash"
    short_prefix = ("neutral status report " * 3) + "critical database crash"
    edge_cases["token_truncation"] = {
        "max_seq_length": es.max_sequence_length,
        "near_1000_char_len": len(near_1000_chars),
        "cos_near1000_padded_vs_crash": round(
            safe_cosine_similarity(es.encode_text(near_1000_chars), base_crash), 4
        ),
        "cos_short_with_crash_vs_crash": round(
            safe_cosine_similarity(es.encode_text(short_prefix), base_crash), 4
        ),
    }

    corp0 = ds.records[0]
    e_c0 = es.encode_text(corp0.text)
    nn_exact = sim.find_nearest_neighbors(
        query_embedding=e_c0,
        records=ds.records,
        corpus_embeddings=emb,
        corpus_coords_3d=coords_3d,
        top_k=3,
        exclude_text=corp0.text,
    )
    nn_nopunct = sim.find_nearest_neighbors(
        query_embedding=e_c0,
        records=ds.records,
        corpus_embeddings=emb,
        corpus_coords_3d=coords_3d,
        top_k=3,
        exclude_text=corp0.text.rstrip("."),
    )
    edge_cases["duplicate_exclusion"] = {
        "corp0_id": corp0.id,
        "exact_exclude_top1": {"id": nn_exact[0].id, "sim": nn_exact[0].cosine_similarity},
        "punctuation_mismatch_top1": {"id": nn_nopunct[0].id, "sim": nn_nopunct[0].cosine_similarity},
    }

    nan_steered = ss.steer_embedding(
        np.full(384, np.nan, dtype=np.float32), ConceptEnum.positive_sentiment, 0.5
    )
    try:
        sms.transform_batch(np.full((1, 384), np.nan, dtype=np.float32))
        umap_nan_err = "did_not_raise"
    except Exception as exc:
        umap_nan_err = f"{type(exc).__name__}: {exc}"

    edge_cases["invalid_guards"] = {
        "nan_strength_rejected": _raises_validation(
            lambda: SteerRequest(text="hi", concept=ConceptEnum.positive_sentiment, strength=float("nan"))
        ),
        "small_sweep_lt3_rejected": _raises_validation(
            lambda: EvaluateRequest(text="hi", concept=ConceptEnum.positive_sentiment, strengths=[-0.5, 0.5])
        ),
        "nan_input_vector_caught_by_steer_service": bool(np.all(np.isfinite(nan_steered))),
        "umap_nan_input_error": umap_nan_err,
    }

    probe_emb = es.encode_text("I love sunny mornings and warm coffee.")
    c_single_probe = sms.transform_vector(probe_emb)
    c_batch_probe = sms.transform_batch(
        np.stack([probe_emb, ss.steer_embedding(probe_emb, ConceptEnum.positive_sentiment, 0.75)])
    )[0]

    return {
        "model": settings.model_name,
        "embedding_dimension": settings.embedding_dimension,
        "max_sequence_length": es.max_sequence_length,
        "corpus": {
            "size": ds.size,
            "sha256_prefix": ds.dataset_hash[:16],
            "category_counts": category_counts,
            "anchors": anchors,
            "near_duplicate_pairs_cos_ge_0_85": near_dups,
        },
        "embedding_quality": {
            "intra_category_cosine_mean": round(float(intra_sims.mean()), 4),
            "intra_category_cosine_std": round(float(intra_sims.std()), 4),
            "inter_category_cosine_mean": round(float(inter_sims.mean()), 4),
            "inter_category_cosine_std": round(float(inter_sims.std()), 4),
        },
        "global_invariants": {
            "max_zero_strength_l2_diff": float(np.max(zero_identity_diffs)),
            "max_norm_deviation_from_1": float(np.max(norm_deviations)),
            "non_finite_steered_count": non_finite_count,
            "repeatability_max_emb_diff": float(np.max(rep_emb_diffs)),
            "repeatability_max_steer_diff": float(np.max(rep_steer_diffs)),
            "repeatability_max_single_umap_diff": float(np.max(rep_umap_diffs)),
        },
        "cv_anchor_generalization": cv_results,
        "cross_concept_direction_cosine": direction_alignment,
        "goal1_controllability": goal1_results,
        "attribute_specificity_matrix": specificity_matrix,
        "goal2_preservation": goal2_results,
        "goal3_visualization_fidelity": {
            "projection_comparison": projection_comparison,
            "query_top5_knn_overlap_384d_vs_3d": _summarize(knn_query_3d),
            "query_top5_knn_overlap_384d_vs_2d": _summarize(knn_query_2d),
            "steer_batch_vs_single_orig_shift": _summarize(steer_batch_orig_shifts),
            "eval_batch_vs_single_zero_shift": _summarize(eval_batch_zero_shifts),
        },
        "robustness_probes": {
            "umap_single_transform": [c_single_probe.x, c_single_probe.y, c_single_probe.z],
            "umap_batch_orig_with_sentiment": [c_batch_probe.x, c_batch_probe.y, c_batch_probe.z],
        },
        "edge_cases": edge_cases,
        "elapsed_seconds": round(time.time() - t0, 2),
    }


def _raises_validation(fn: Any) -> bool:
    try:
        fn()
        return False
    except ValidationError:
        return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Run VectiQ scientific benchmark & baseline comparison.")
    parser.add_argument("--output", type=Path, default=None, help="Optional path to write JSON results.")
    args = parser.parse_args()

    results = run_benchmark()
    rendered = json.dumps(results, indent=2)
    print(rendered)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
