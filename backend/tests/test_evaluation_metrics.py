"""Comprehensive tests for all scientific evaluation metrics, edge cases, and /api/v1/evaluate schema."""

from pathlib import Path

from fastapi.testclient import TestClient
import numpy as np

from app.core.config import Settings
from app.models.schemas import ConceptEnum
from app.services.container import ServiceContainer
from app.services.manifold_metrics import (
    compute_2d_vs_3d_overlap,
    compute_continuity_and_overlap,
    compute_projection_distortion,
    deterministic_sample_indices,
    validate_unit_norm_vectors,
)


def test_evaluate_endpoint_full_scientific_metrics_schema(client: TestClient) -> None:
    """Verify POST /api/v1/evaluate exposes all 10 scientific evaluation metrics with real values."""
    res = client.post(
        "/api/v1/evaluate",
        json={
            "text": "The system architecture is simple, direct, and fast.",
            "concept": "formal_tone",
            "strengths": [-1.0, -0.5, 0.0, 0.5, 1.0],
            "top_k_neighbors": 5,
            "continuity_k": 10,
            "overlap_k": 5,
        },
    )
    assert res.status_code == 200
    summary = res.json()["metrics_summary"]

    # Preserved legacy fields
    assert summary["monotonicity"]["is_monotonic"] is True
    assert 0.0 <= summary["umap_trustworthiness"] <= 1.0

    # Trustworthiness detail + distinct 2D & 3D UMAP continuity
    td = summary["umap_trustworthiness_detail"]
    c2 = summary["umap_continuity_2d"]
    c3 = summary["umap_continuity_3d"]
    assert td["status"] == "computed" and td["sample_size"] == 360 and td["parameters"]["k"] == 15
    assert c2["status"] == "computed" and c2["sample_size"] == 360 and c2["parameters"]["k"] == 10
    assert c3["status"] == "computed" and c3["sample_size"] == 360 and c3["parameters"]["k"] == 10
    assert 0.0 <= c2["value"] <= 1.0 and 0.0 <= c3["value"] <= 1.0
    assert c2["value"] != td["value"]
    assert c3["value"] != td["value"]
    assert "knn_recall_vs_384d" in c2["parameters"] and "knn_recall_vs_384d" in c3["parameters"]

    # 2D vs 3D Visual Neighborhood Overlap (kept distinct from 384D recalls)
    ov = summary["neighborhood_overlap_2d_3d"]
    assert ov["status"] == "computed"
    assert ov["sample_size"] == 360
    assert ov["parameters"]["k"] == 5
    assert 0.0 <= ov["value"] <= 1.0
    assert 0.0 <= ov["mean_jaccard"] <= 1.0
    assert len(ov["point_examples"]) >= 1
    assert 0.0 <= ov["projected_vs_384d_overlap_2d"] <= 1.0
    assert 0.0 <= ov["projected_vs_384d_overlap_3d"] <= 1.0

    # Projection Distortion (2D & 3D)
    d2 = summary["projection_distortion_2d"]
    d3 = summary["projection_distortion_3d"]
    expected_pairs = 360 * 359 // 2
    assert d2["status"] == "computed" and d2["sample_size"] == 360 and d2["pair_count"] == expected_pairs
    assert d3["status"] == "computed" and d3["sample_size"] == 360 and d3["pair_count"] == expected_pairs
    assert -1.0 <= d2["spearman_correlation"] <= 1.0 and d2["kruskal_stress_1"] >= 0.0
    assert -1.0 <= d3["spearman_correlation"] <= 1.0 and d3["kruskal_stress_1"] >= 0.0

    # Transform Stability
    ts = summary["transform_stability"]
    assert ts["status"] in ("passed", "partial", "failed")
    assert ts["sample_size"] == 5 and ts["runs"] == 2
    assert ts["parameters"]["umap_refit_during_test"] is False
    assert ts["repeat_batch_max_diff"] is not None and ts["repeat_batch_max_diff"] <= 1e-5
    assert ts["order_invariance_max_diff"] is not None and ts["order_invariance_max_diff"] <= 1e-5
    assert ts["single_vs_batch_max_diff"] is not None

    # Unit-Norm Validation (1 original + 5 steered = 6 tested)
    nv = summary["unit_norm_validation"]
    assert nv["status"] == "passed"
    assert nv["total_tested"] == 6 and nv["valid_count"] == 6 and nv["invalid_count"] == 0
    assert nv["nan_count"] == 0 and nv["inf_count"] == 0 and nv["zero_vector_count"] == 0
    assert nv["wrong_dim_count"] == 0
    assert abs(nv["original_norm"] - 1.0) <= nv["tolerance"]
    assert len(nv["steered_norms"]) == 5

    # Vector Displacement Alignment (+D, -D, and lambda=0.0 explicit handling)
    da = summary["vector_displacement_alignment"]
    assert da["status"] == "computed"
    assert da["sample_size"] == 4  # 4 nonzero steps out of 5
    assert da["zero_strength_handled"] is True
    assert da["positive_mean_alignment"] > 0.7
    assert da["negative_mean_alignment"] > 0.7
    zero_entry = next(s for s in da["step_alignments"] if s["strength"] == 0.0)
    assert zero_entry["is_zero_displacement"] is True and zero_entry["alignment"] is None

    # Steering Repeatability
    sr = summary["steering_repeatability"]
    assert sr["status"] == "passed"
    assert sr["runs"] == 3 and sr["sample_size"] == 15
    assert sr["is_consistent"] is True
    assert sr["max_vector_diff"] <= 1e-6
    assert sr["min_vector_cosine"] >= 0.999999


def test_unit_norm_validator_edge_cases_without_silent_normalization() -> None:
    """Detect NaN, Inf, zero vectors, out-of-tolerance norms, and wrong dimensions directly."""
    valid = np.ones(384, dtype=np.float32) / np.sqrt(384.0)
    unnorm = np.ones(384, dtype=np.float32) * 2.0
    nan_vec = valid.copy()
    nan_vec[0] = np.nan
    inf_vec = valid.copy()
    inf_vec[5] = np.inf
    zero_vec = np.zeros(384, dtype=np.float32)
    wrong_dim = np.ones(128, dtype=np.float32) / np.sqrt(128.0)

    audit = validate_unit_norm_vectors(
        [valid, unnorm, nan_vec, inf_vec, zero_vec, wrong_dim],
        expected_dim=384,
        tolerance=1e-4,
        labels=["valid", "unnormalized", "nan", "inf", "zero", "dim128"],
    )
    assert audit["status"] == "failed"
    assert audit["total_tested"] == 6
    assert audit["valid_count"] == 1
    assert audit["invalid_count"] == 5
    assert audit["nan_count"] == 1
    assert audit["inf_count"] == 1
    assert audit["zero_vector_count"] == 1
    assert audit["wrong_dim_count"] == 1
    assert audit["min_norm"] == 0.0
    assert abs(audit["max_norm"] - 2.0 * np.sqrt(384.0)) < 1e-3

    # Empty vector list returns structured unavailable rather than empty crash
    empty_audit = validate_unit_norm_vectors([])
    assert empty_audit["status"] == "unavailable"
    assert empty_audit["total_tested"] == 0


def test_continuity_overlap_and_distortion_insufficient_or_degenerate_data() -> None:
    """Verify insufficient samples, oversized k, and constant distances return status=unavailable."""
    small_d = np.array([[0.0, 1.0], [1.0, 0.0]])
    c_small = compute_continuity_and_overlap(small_d, small_d, k=1)
    assert c_small["status"] == "unavailable" and c_small["value"] is None

    med_d = np.array(
        [
            [0.0, 1.0, 2.0, 3.0, 4.0],
            [1.0, 0.0, 1.0, 2.0, 3.0],
            [2.0, 1.0, 0.0, 1.0, 2.0],
            [3.0, 2.0, 1.0, 0.0, 1.0],
            [4.0, 3.0, 2.0, 1.0, 0.0],
        ]
    )
    bad_k = compute_continuity_and_overlap(med_d, med_d, k=3)
    assert bad_k["status"] == "unavailable"

    ov_one = compute_2d_vs_3d_overlap(np.zeros((1, 1)), np.zeros((1, 1)), k=1)
    assert ov_one["status"] == "unavailable"

    # Zero-variance constant pairwise distances -> unavailable correlation/stress
    const_tri = np.array([1.0, 1.0, 1.0, 1.0])
    dist_const = compute_projection_distortion(const_tri, np.array([1.0, 2.0, 3.0, 4.0]), sample_size=4)
    assert dist_const["status"] == "unavailable"

    # Trustworthiness vs continuity asymmetry: tear out point 0's true closest neighbor in projection
    rng = np.random.default_rng(7)
    x_hi = rng.normal(size=(20, 4))
    d_hi = np.linalg.norm(x_hi[:, None, :] - x_hi[None, :, :], axis=-1)
    d_lo = d_hi.copy()
    j_near = int(np.argsort(d_hi[0])[1])
    d_lo[0, j_near] = d_lo[j_near, 0] = 100.0
    res_asym = compute_continuity_and_overlap(d_hi, d_lo, k=3)
    assert res_asym["status"] == "computed"
    assert res_asym["continuity"] < res_asym["trustworthiness"]

    # Deterministic subsample verification for N > 500
    idx_a, sampled_a = deterministic_sample_indices(1200, max_samples=500, seed=42)
    idx_b, sampled_b = deterministic_sample_indices(1200, max_samples=500, seed=42)
    assert sampled_a is True and sampled_b is True
    assert len(idx_a) == 500 and np.array_equal(idx_a, idx_b)


def test_all_zero_strength_sweep_displacement_alignment_unavailable(client: TestClient) -> None:
    """Verify an all-zero strength sweep returns explicit unavailable displacement alignment without crash."""
    res = client.post(
        "/api/v1/evaluate",
        json={
            "text": "The quarterly technical report was archived.",
            "concept": "technical_tone",
            "strengths": [0.0, 0.0, 0.0],
            "top_k_neighbors": 5,
        },
    )
    assert res.status_code == 200
    da = res.json()["metrics_summary"]["vector_displacement_alignment"]
    assert da["status"] == "unavailable"
    assert da["value"] is None
    assert da["sample_size"] == 0
    assert da["zero_strength_handled"] is True
    assert da["unavailable_reason"] is not None


def test_real_model_evaluate_metrics_end_to_end(tmp_path: Path) -> None:
    """Verify real cached MiniLM + fitted UMAP produces genuine finite evaluation metrics."""
    backend_dir = Path(__file__).resolve().parent.parent
    real_settings = Settings(
        data_dir=backend_dir / "data",
        artifacts_dir=backend_dir / "artifacts",
        environment="test",
        emotion_reviews_db_path_override=str(tmp_path / "eval_real_reviews.db"),
    )
    container = ServiceContainer(real_settings)
    container.initialize(save_artifacts=True)

    result = container.evaluation_service.evaluate(
        text="The distributed consensus protocol reduces tail latency under load.",
        concept=ConceptEnum.positive_sentiment,
        strengths=[-1.0, 0.0, 1.0],
        top_k_neighbors=5,
    )
    ms = result.metrics_summary
    assert ms.umap_continuity_2d is not None and ms.umap_continuity_2d.status == "computed"
    assert ms.umap_continuity_3d is not None and ms.umap_continuity_3d.status == "computed"
    assert ms.umap_continuity_3d.value >= ms.umap_continuity_2d.value - 0.05
    assert ms.neighborhood_overlap_2d_3d is not None and ms.neighborhood_overlap_2d_3d.status == "computed"
    assert ms.projection_distortion_2d is not None and ms.projection_distortion_2d.status == "computed"
    assert ms.projection_distortion_3d is not None and ms.projection_distortion_3d.status == "computed"
    assert ms.unit_norm_validation is not None and ms.unit_norm_validation.status == "passed"
    assert ms.vector_displacement_alignment is not None and ms.vector_displacement_alignment.status == "computed"
    assert ms.steering_repeatability is not None and ms.steering_repeatability.status == "passed"
    assert ms.transform_stability is not None and ms.transform_stability.is_deterministic is True
