"""Quantitative evaluation service for steering control, preservation, stability, and monotonicity."""

import hashlib
import math
from typing import Optional

import numpy as np
from scipy.stats import pearsonr, spearmanr

from app.core.exceptions import EngineNotReadyError
from app.models.schemas import (
    ConceptEnum,
    Coordinate3D,
    DisplacementAlignmentDetail,
    DisplacementStepAlignment,
    EvaluateResponse,
    EvaluationMetricsSummary,
    EvaluationStep,
    MonotonicitySummary,
    PreservationSummary,
    RepeatabilityDetail,
    StabilitySummary,
    TransformStabilityDetail,
    UnitNormValidationDetail,
    UnitNormVectorCheck,
)
from app.services.dataset_service import DatasetService
from app.services.embedding_service import (
    NORM_EPSILON,
    EmbeddingService,
    safe_cosine_similarity,
)
from app.services.manifold_metrics import validate_unit_norm_vectors
from app.services.semantic_map_service import SemanticMapService
from app.services.similarity_service import SimilarityService
from app.services.steering_service import SteeringService

MONOTONIC_EPSILON = 1e-6


def _jaccard_similarity(ids_a: set[str], ids_b: set[str]) -> float:
    """Compute Jaccard overlap between two neighbor ID sets."""
    if not ids_a and not ids_b:
        return 1.0
    union = ids_a | ids_b
    if not union:
        return 0.0
    return float(len(ids_a & ids_b) / len(union))


class EvaluationService:
    """Evaluates multi-strength steering behavior with actual embeddings and metrics."""

    def __init__(
        self,
        *,
        dataset_service: DatasetService,
        embedding_service: EmbeddingService,
        steering_service: SteeringService,
        semantic_map_service: SemanticMapService,
        similarity_service: SimilarityService,
    ) -> None:
        self.dataset_service = dataset_service
        self.embedding_service = embedding_service
        self.steering_service = steering_service
        self.semantic_map_service = semantic_map_service
        self.similarity_service = similarity_service

    def evaluate(
        self,
        *,
        text: str,
        concept: ConceptEnum,
        strengths: list[float],
        top_k_neighbors: int = 5,
        continuity_k: Optional[int] = None,
        overlap_k: Optional[int] = None,
    ) -> EvaluateResponse:
        """Sweep steering strengths and compute step and aggregate evaluation metrics."""
        if (
            not self.semantic_map_service.is_fitted
            or self.semantic_map_service.corpus_embeddings is None
            or self.semantic_map_service.corpus_coords_3d is None
        ):
            raise EngineNotReadyError("Semantic map projection is not initialized.")

        orig_emb = self.embedding_service.encode_text(text)
        base_score = self.steering_service.compute_concept_score(orig_emb, concept)

        base_neighbors = self.similarity_service.find_nearest_neighbors(
            query_embedding=orig_emb,
            records=self.dataset_service.records,
            corpus_embeddings=self.semantic_map_service.corpus_embeddings,
            corpus_coords_3d=self.semantic_map_service.corpus_coords_3d,
            top_k=top_k_neighbors,
            exclude_text=text,
        )
        base_neighbor_ids = {item.id for item in base_neighbors}

        step_embeddings = np.stack(
            [
                self.steering_service.steer_embedding(orig_emb, concept, strength)
                for strength in strengths
            ],
            axis=0,
        )
        step_coords = self.semantic_map_service.transform_batch(step_embeddings)

        steps: list[EvaluationStep] = []
        step_neighbor_sets: list[set[str]] = []

        for idx, strength in enumerate(strengths):
            emb_step = step_embeddings[idx]
            concept_score = self.steering_service.compute_concept_score(emb_step, concept)
            preservation = (
                1.0
                if strength == 0.0
                else safe_cosine_similarity(orig_emb, emb_step)
            )
            neighbors = (
                base_neighbors
                if strength == 0.0
                else self.similarity_service.find_nearest_neighbors(
                    query_embedding=emb_step,
                    records=self.dataset_service.records,
                    corpus_embeddings=self.semantic_map_service.corpus_embeddings,
                    corpus_coords_3d=self.semantic_map_service.corpus_coords_3d,
                    top_k=top_k_neighbors,
                    exclude_text=text,
                )
            )
            neighbor_ids = {item.id for item in neighbors}
            stability = _jaccard_similarity(base_neighbor_ids, neighbor_ids)

            step_neighbor_sets.append(neighbor_ids)
            steps.append(
                EvaluationStep(
                    strength=float(strength),
                    concept_score=round(concept_score, 6),
                    semantic_preservation=round(preservation, 6),
                    neighbor_stability=round(stability, 6),
                    coordinates=step_coords[idx],
                    nearest_neighbors=neighbors,
                )
            )

        summary = self._build_summary(
            steps=steps,
            step_neighbor_sets=step_neighbor_sets,
            base_neighbor_ids=base_neighbor_ids,
            orig_emb=orig_emb,
            step_embeddings=step_embeddings,
            step_coords=step_coords,
            concept=concept,
            strengths=strengths,
            top_k_neighbors=top_k_neighbors,
            continuity_k=continuity_k,
            overlap_k=overlap_k,
        )

        return EvaluateResponse(
            input_text=text,
            concept=concept,
            base_concept_score=round(base_score, 6),
            steps=steps,
            metrics_summary=summary,
        )

    def _build_unit_norm_validation(
        self,
        *,
        orig_emb: np.ndarray,
        step_embeddings: np.ndarray,
        strengths: list[float],
    ) -> UnitNormValidationDetail:
        """Validate L2 unit norms of original and steered vectors without modifying invalid inputs."""
        vectors = [orig_emb] + [step_embeddings[i] for i in range(len(strengths))]
        labels = ["original"] + [f"steered_lambda_{float(s):+.3f}" for s in strengths]
        vec_strengths: list[Optional[float]] = [None] + [float(s) for s in strengths]
        tol = 1e-4

        audit = validate_unit_norm_vectors(
            vectors,
            expected_dim=self.steering_service.expected_dimension,
            tolerance=tol,
            labels=labels,
            strengths=vec_strengths,
        )
        orig_chk = audit["checks"][0] if audit["checks"] else None
        steered_checks = [UnitNormVectorCheck(**chk) for chk in audit["checks"][1:]]

        return UnitNormValidationDetail(
            value=audit["value"],
            status=audit["status"],
            sample_size=audit["total_tested"],
            parameters={
                "tolerance": tol,
                "expected_dimension": self.steering_service.expected_dimension,
                "original_vector_included": True,
                "steered_step_count": len(strengths),
            },
            methodology=(
                "Raw float64 norm ||E||_2 = sqrt(sum(E_i^2)) checked against abs(||E||_2 - 1) <= tolerance "
                "plus explicit NaN, Inf, zero-norm, and dimension checks without re-normalizing inputs."
            ),
            limitations=(
                "Confirms spherical unit length and finiteness for evaluated embeddings; unit norm alone does not "
                "prove semantic similarity or text reconstructibility."
            ),
            unavailable_reason=audit["reason"],
            original_norm=orig_chk["norm"] if orig_chk else None,
            steered_norms=steered_checks,
            valid_count=audit["valid_count"],
            invalid_count=audit["invalid_count"],
            total_tested=audit["total_tested"],
            tolerance=audit["tolerance"],
            min_norm=audit["min_norm"],
            max_norm=audit["max_norm"],
            max_deviation=audit["max_deviation"],
            nan_count=audit["nan_count"],
            inf_count=audit["inf_count"],
            zero_vector_count=audit["zero_vector_count"],
            wrong_dim_count=audit["wrong_dim_count"],
        )

    def _build_displacement_alignment(
        self,
        *,
        orig_emb: np.ndarray,
        step_embeddings: np.ndarray,
        strengths: list[float],
        concept: ConceptEnum,
    ) -> DisplacementAlignmentDetail:
        """Compute cos(E' - E, sign(lambda) * D) across evaluated strengths."""
        d_vec = self.steering_service.get_direction(concept)
        orig_id = "vec_orig_" + hashlib.sha256(orig_emb.tobytes()).hexdigest()[:8]

        step_alignments: list[DisplacementStepAlignment] = []
        pos_vals: list[float] = []
        neg_vals: list[float] = []
        nonzero_vals: list[float] = []
        zero_handled = False

        for idx, s in enumerate(strengths):
            emb_step = step_embeddings[idx]
            step_id = "vec_step_" + hashlib.sha256(emb_step.tobytes()).hexdigest()[:8]
            delta = emb_step - orig_emb
            disp_norm = float(np.linalg.norm(delta.astype(np.float64)))
            intended_sign = 0 if s == 0.0 else (1 if s > 0.0 else -1)

            if s == 0.0 or disp_norm <= NORM_EPSILON:
                if s == 0.0:
                    zero_handled = True
                step_alignments.append(
                    DisplacementStepAlignment(
                        strength=float(s),
                        vector_id=step_id,
                        intended_sign=intended_sign,
                        alignment=None,
                        displacement_norm=round(disp_norm, 6),
                        is_zero_displacement=True,
                    )
                )
                continue

            target_dir = d_vec if intended_sign > 0 else -d_vec
            align = safe_cosine_similarity(delta, target_dir)
            nonzero_vals.append(align)
            if intended_sign > 0:
                pos_vals.append(align)
            else:
                neg_vals.append(align)

            step_alignments.append(
                DisplacementStepAlignment(
                    strength=float(s),
                    vector_id=step_id,
                    intended_sign=intended_sign,
                    alignment=round(align, 6),
                    displacement_norm=round(disp_norm, 6),
                    is_zero_displacement=False,
                )
            )

        if not nonzero_vals:
            return DisplacementAlignmentDetail(
                value=None,
                status="unavailable",
                sample_size=0,
                parameters={"concept": concept.value, "total_steps": len(strengths), "nonzero_steps": 0},
                methodology=(
                    "Cosine similarity between physical displacement Delta = E' - E and signed target axis "
                    "sign(lambda) * D for each nonzero strength step; zero displacement handled explicitly."
                ),
                limitations=(
                    "Cannot evaluate directional alignment without nonzero displacement steps."
                ),
                unavailable_reason="No nonzero displacement steps present in evaluated strength sweep.",
                concept=concept,
                zero_strength_handled=zero_handled,
                original_vector_id=orig_id,
                step_alignments=step_alignments,
            )

        return DisplacementAlignmentDetail(
            value=round(float(np.mean(nonzero_vals)), 6),
            status="computed",
            sample_size=len(nonzero_vals),
            parameters={
                "concept": concept.value,
                "direction_norm": round(float(np.linalg.norm(d_vec)), 6),
                "total_steps": len(strengths),
                "nonzero_steps": len(nonzero_vals),
                "positive_steps": len(pos_vals),
                "negative_steps": len(neg_vals),
            },
            methodology=(
                "cos(E' - E, sign(lambda) * D) across nonzero steering strengths, evaluating E' - E directly against "
                "+D for lambda > 0 and -D for lambda < 0, with lambda = 0.0 zero displacement flagged explicitly."
            ),
            limitations=(
                "Unit-sphere renormalization bends E' - E slightly toward -E as |lambda| increases; alignment near 1.0 "
                "confirms geometric control along D, not independent grammatical quality."
            ),
            concept=concept,
            positive_mean_alignment=round(float(np.mean(pos_vals)), 6) if pos_vals else None,
            negative_mean_alignment=round(float(np.mean(neg_vals)), 6) if neg_vals else None,
            zero_strength_handled=zero_handled,
            original_vector_id=orig_id,
            step_alignments=step_alignments,
        )

    def _build_steering_repeatability(
        self,
        *,
        orig_emb: np.ndarray,
        concept: ConceptEnum,
        strengths: list[float],
        runs: int = 3,
    ) -> RepeatabilityDetail:
        """Re-execute steering independently across R runs to verify output & displacement consistency."""
        if not strengths or runs < 2:
            return RepeatabilityDetail(
                value=None,
                status="unavailable",
                sample_size=0,
                runs=runs,
                methodology="Repeated identical executions of SteeringService.steer_embedding.",
                limitations="Requires at least 2 repeated runs and >= 1 strength step.",
                unavailable_reason="Insufficient runs or strength steps for repeatability evaluation.",
            )

        vec_diffs: list[float] = []
        vec_cosines: list[float] = []
        disp_diffs: list[float] = []

        for s in strengths:
            run_vecs = [
                self.steering_service.steer_embedding(orig_emb, concept, float(s))
                for _ in range(runs)
            ]
            ref_vec = run_vecs[0]
            ref_delta = ref_vec - orig_emb
            for cand in run_vecs[1:]:
                diff = float(np.linalg.norm((cand - ref_vec).astype(np.float64)))
                vec_diffs.append(diff)
                vec_cosines.append(safe_cosine_similarity(ref_vec, cand))
                disp_diff = float(np.linalg.norm(((cand - orig_emb) - ref_delta).astype(np.float64)))
                disp_diffs.append(disp_diff)

        max_diff = float(max(vec_diffs))
        mean_diff = float(np.mean(vec_diffs))
        min_cos = float(min(vec_cosines))
        max_disp_diff = float(max(disp_diffs))
        is_consistent = max_diff <= 1e-6 and max_disp_diff <= 1e-6

        return RepeatabilityDetail(
            value=round(min_cos, 6),
            status="passed" if is_consistent else "failed",
            sample_size=len(strengths) * runs,
            parameters={
                "runs_per_strength": runs,
                "strength_count": len(strengths),
                "tolerance": 1e-6,
            },
            methodology=(
                f"Independently executed SteeringService.steer_embedding {runs} times per strength on the uncached "
                "input vector and compared resulting embeddings, cosine similarity, and displacement vectors."
            ),
            limitations=(
                "Evaluates deterministic numerical reproducibility of linear+normalization steering on identical fixed "
                "input embeddings rather than stochastic sampling or cross-model variance."
            ),
            runs=runs,
            max_vector_diff=round(max_diff, 8),
            mean_vector_diff=round(mean_diff, 8),
            min_vector_cosine=round(min_cos, 6),
            max_displacement_diff=round(max_disp_diff, 8),
            is_consistent=is_consistent,
        )

    def _build_transform_stability(
        self,
        *,
        step_embeddings: np.ndarray,
        step_coords: list[Coordinate3D],
        tolerance: float = 1e-5,
    ) -> TransformStabilityDetail:
        """Evaluate fitted UMAP transform repeatability, order invariance, and batch-composition drift."""
        n_samples = int(step_embeddings.shape[0])
        if n_samples < 1:
            return TransformStabilityDetail(
                value=None,
                status="unavailable",
                sample_size=0,
                runs=0,
                tolerance=tolerance,
                methodology="Out-of-sample fitted UMAP transform stability checks.",
                limitations="No step embeddings supplied.",
                unavailable_reason="At least 1 embedding vector is required.",
            )

        coords_repeat = self.semantic_map_service.transform_batch(step_embeddings)
        repeat_diffs = [
            math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))
            for a, b in zip(step_coords, coords_repeat)
        ]

        coords_rev = list(
            reversed(self.semantic_map_service.transform_batch(step_embeddings[::-1]))
        )
        order_diffs = [
            math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))
            for a, b in zip(step_coords, coords_rev)
        ]

        coords_single = [
            self.semantic_map_service.transform_vector(step_embeddings[i])
            for i in range(n_samples)
        ]
        single_diffs = [
            math.dist((a.x, a.y, a.z), (b.x, b.y, b.z))
            for a, b in zip(step_coords, coords_single)
        ]

        max_rep = float(max(repeat_diffs))
        mean_rep = float(np.mean(repeat_diffs))
        max_ord = float(max(order_diffs))
        mean_ord = float(np.mean(order_diffs))
        max_single = float(max(single_diffs))
        mean_single = float(np.mean(single_diffs))
        max_overall = max(max_rep, max_ord, max_single)

        is_det = max_rep <= tolerance
        is_ord = max_ord <= tolerance
        is_comp = max_single <= tolerance

        if is_det and is_ord and is_comp:
            status = "passed"
        elif is_det and is_ord:
            status = "partial"
        else:
            status = "failed"

        return TransformStabilityDetail(
            value=round(max_overall, 6),
            status=status,
            sample_size=n_samples,
            parameters={
                "tested_vectors": n_samples,
                "batch_runs": 2,
                "reversed_order_checked": True,
                "single_vs_batch_checked": True,
                "umap_refit_during_test": False,
            },
            methodology=(
                "Evaluates the frozen fitted UMAP transform (without refitting) across: (1) repeated identical batch calls, "
                "(2) reversed batch input order, and (3) isolated single-vector transform vs. co-batched transform."
            ),
            limitations=(
                "umap-learn out-of-sample transform couples graph initialization across co-batched rows, so identical repeated "
                "or permuted full batches are deterministic while single-vector vs. batched calls can differ modestly."
            ),
            runs=2,
            tolerance=tolerance,
            repeat_batch_max_diff=round(max_rep, 6),
            repeat_batch_mean_diff=round(mean_rep, 6),
            order_invariance_max_diff=round(max_ord, 6),
            order_invariance_mean_diff=round(mean_ord, 6),
            single_vs_batch_max_diff=round(max_single, 6),
            single_vs_batch_mean_diff=round(mean_single, 6),
            is_deterministic=is_det,
            is_order_invariant=is_ord,
            is_batch_composition_invariant=is_comp,
        )

    def _build_summary(
        self,
        *,
        steps: list[EvaluationStep],
        step_neighbor_sets: list[set[str]],
        base_neighbor_ids: set[str],
        orig_emb: np.ndarray,
        step_embeddings: np.ndarray,
        step_coords: list[Coordinate3D],
        concept: ConceptEnum,
        strengths: list[float],
        top_k_neighbors: int,
        continuity_k: Optional[int],
        overlap_k: Optional[int],
    ) -> EvaluationMetricsSummary:
        """Compute monotonicity, preservation retention, stability, linearity, and full scientific diagnostics."""
        paired = sorted(
            zip(steps, step_neighbor_sets), key=lambda pair: pair[0].strength
        )
        sorted_strengths = [pair[0].strength for pair in paired]
        sorted_scores = [pair[0].concept_score for pair in paired]

        is_monotonic = all(
            sorted_scores[i + 1] >= sorted_scores[i] - MONOTONIC_EPSILON
            for i in range(len(sorted_scores) - 1)
        )

        spearman_val: Optional[float] = None
        pearson_val: Optional[float] = None
        linearity_val: Optional[float] = None

        if len(set(sorted_strengths)) >= 2 and np.std(sorted_scores) > 0:
            sp = spearmanr(sorted_strengths, sorted_scores).statistic
            if sp is not None and math.isfinite(float(sp)):
                spearman_val = round(float(sp), 6)

            pr = pearsonr(sorted_strengths, sorted_scores).statistic
            if pr is not None and math.isfinite(float(pr)):
                pearson_val = round(float(pr), 6)
                linearity_val = round(float(pr) ** 2, 6)

        interval_checks: list[bool] = []
        for i in range(len(sorted_strengths) - 1):
            d_strength = sorted_strengths[i + 1] - sorted_strengths[i]
            if d_strength > MONOTONIC_EPSILON:
                d_score = sorted_scores[i + 1] - sorted_scores[i]
                interval_checks.append(d_score >= -MONOTONIC_EPSILON)

        directional_consistency: Optional[float] = (
            round(float(sum(interval_checks) / len(interval_checks)), 6)
            if interval_checks
            else None
        )

        preservations = [step.semantic_preservation for step in steps]
        mean_pres = round(float(np.mean(preservations)), 6)
        min_pres = round(float(np.min(preservations)), 6)
        decay_rate = round(max(0.0, 1.0 - min_pres), 6)

        stabilities = [step.neighbor_stability for step in steps]
        mean_stab = round(float(np.mean(stabilities)), 6)
        min_stab = round(float(np.min(stabilities)), 6)

        # Retained count at maximum positive (or largest) strength step
        max_neighbor_set = paired[-1][1]
        retained_at_max = len(base_neighbor_ids & max_neighbor_set)

        unit_norm_detail = self._build_unit_norm_validation(
            orig_emb=orig_emb, step_embeddings=step_embeddings, strengths=strengths
        )
        displacement_detail = self._build_displacement_alignment(
            orig_emb=orig_emb,
            step_embeddings=step_embeddings,
            strengths=strengths,
            concept=concept,
        )
        repeatability_detail = self._build_steering_repeatability(
            orig_emb=orig_emb, concept=concept, strengths=strengths
        )
        transform_detail = self._build_transform_stability(
            step_embeddings=step_embeddings, step_coords=step_coords
        )
        corpus_fidelity = self.semantic_map_service.compute_corpus_fidelity_metrics(
            continuity_k=continuity_k,
            overlap_k=overlap_k if overlap_k is not None else top_k_neighbors,
            record_ids=[rec.id for rec in self.dataset_service.records],
        )

        return EvaluationMetricsSummary(
            monotonicity=MonotonicitySummary(
                is_monotonic=is_monotonic,
                spearman_correlation=spearman_val,
                pearson_correlation=pearson_val,
                directional_consistency=directional_consistency,
            ),
            preservation_retention=PreservationSummary(
                mean_preservation=mean_pres,
                min_preservation=min_pres,
                preservation_decay_rate=decay_rate,
            ),
            stability_summary=StabilitySummary(
                mean_neighbor_stability=mean_stab,
                min_neighbor_stability=min_stab,
                retained_original_neighbors_at_max=retained_at_max,
            ),
            linearity_score=linearity_val,
            umap_trustworthiness=self.semantic_map_service.trustworthiness,
            umap_trustworthiness_detail=corpus_fidelity["umap_trustworthiness_detail"],
            umap_continuity_2d=corpus_fidelity["umap_continuity_2d"],
            umap_continuity_3d=corpus_fidelity["umap_continuity_3d"],
            neighborhood_overlap_2d_3d=corpus_fidelity["neighborhood_overlap_2d_3d"],
            projection_distortion_2d=corpus_fidelity["projection_distortion_2d"],
            projection_distortion_3d=corpus_fidelity["projection_distortion_3d"],
            transform_stability=transform_detail,
            unit_norm_validation=unit_norm_detail,
            vector_displacement_alignment=displacement_detail,
            steering_repeatability=repeatability_detail,
        )

