"""UMAP dimensionality reduction, artifact caching, and semantic map assembly."""

import json
from pathlib import Path
import threading
from typing import Any, Literal, Optional

import joblib
import numpy as np
from sklearn.manifold import trustworthiness as sklearn_trustworthiness
from sklearn.metrics import pairwise_distances
import umap

from app.core.exceptions import EngineNotReadyError
from app.core.logging import get_logger
from app.models.schemas import (
    ClusterSummary,
    ConceptEnum,
    Coordinate3D,
    MapBounds,
    MetricEvaluationDetail,
    NeighborhoodOverlapDetail,
    OverlapPointExample,
    ProjectionDistortionDetail,
    SemanticMapHumanEmotionItem,
    SemanticMapPoint,
    SemanticMapResponse,
)
from app.services.dataset_service import CorpusRecord, DatasetService
from app.services.manifold_metrics import (
    compute_2d_vs_3d_overlap,
    compute_continuity_and_overlap,
    compute_projection_distortion,
    deterministic_sample_indices,
    prepare_neighbor_ranks,
)

logger = get_logger(__name__)


class SemanticMapService:
    """Manages fitted 3D UMAP projection, disk artifacts, and semantic map queries."""

    def __init__(
        self,
        *,
        artifacts_dir: Path,
        n_components: int = 3,
        n_neighbors: int = 15,
        min_dist: float = 0.1,
        metric: str = "cosine",
        random_state: int = 42,
    ) -> None:
        self.artifacts_dir = artifacts_dir
        self.n_components = n_components
        self.n_neighbors = n_neighbors
        self.min_dist = min_dist
        self.metric = metric
        self.random_state = random_state

        self._umap_model: Optional[Any] = None
        self._transform_lock = threading.Lock()
        self.corpus_embeddings: Optional[np.ndarray] = None
        self.corpus_coords_3d: Optional[np.ndarray] = None
        self.trustworthiness: Optional[float] = None
        self.corpus_concept_scores: dict[ConceptEnum, np.ndarray] = {}
        self._manifold_cache: Optional[dict[str, Any]] = None

    @property
    def is_fitted(self) -> bool:
        """Return True if the canonical UMAP projection and coordinates are ready."""
        return (
            self._umap_model is not None
            and self.corpus_embeddings is not None
            and self.corpus_coords_3d is not None
        )

    def _artifact_paths(self) -> tuple[Path, Path, Path, Path]:
        return (
            self.artifacts_dir / "manifest.json",
            self.artifacts_dir / "corpus_embeddings.npy",
            self.artifacts_dir / "corpus_coords_3d.npy",
            self.artifacts_dir / "umap_model.joblib",
        )

    def _expected_manifest(
        self, dataset_hash: str, model_name: str, corpus_size: int
    ) -> dict[str, Any]:
        return {
            "dataset_hash": dataset_hash,
            "model_name": model_name,
            "corpus_size": corpus_size,
            "n_components": self.n_components,
            "n_neighbors": self.n_neighbors,
            "min_dist": self.min_dist,
            "metric": self.metric,
            "random_state": self.random_state,
        }

    def try_load_cached_artifacts(
        self, *, dataset_hash: str, model_name: str, corpus_size: int
    ) -> bool:
        """Load cached embeddings and fitted UMAP model if manifest matches current config."""
        manifest_path, emb_path, coords_path, umap_path = self._artifact_paths()
        if not all(p.exists() for p in (manifest_path, emb_path, coords_path, umap_path)):
            return False

        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            expected = self._expected_manifest(dataset_hash, model_name, corpus_size)
            if any(manifest.get(k) != v for k, v in expected.items()):
                logger.info("Cached semantic map artifacts are stale; regenerating.")
                return False

            embeddings = np.load(emb_path).astype(np.float32)
            coords = np.load(coords_path).astype(np.float32)
            model = joblib.load(umap_path)

            if embeddings.shape[0] != corpus_size or coords.shape != (
                corpus_size,
                self.n_components,
            ):
                logger.info("Cached artifact shape mismatch; regenerating.")
                return False

            self.corpus_embeddings = embeddings
            self.corpus_coords_3d = coords
            self._umap_model = model
            self.trustworthiness = float(manifest.get("trustworthiness", 0.0))
            self._manifold_cache = None
            self._warmup_transform()
            logger.info(
                "Loaded cached UMAP & corpus artifacts from %s (trustworthiness=%.4f).",
                self.artifacts_dir,
                self.trustworthiness,
            )
            return True
        except Exception as exc:
            logger.warning("Failed to load cached artifacts (%s); regenerating.", exc)
            return False

    def fit_and_save(
        self,
        *,
        embeddings: np.ndarray,
        dataset_hash: str,
        model_name: str,
        save_artifacts: bool = True,
    ) -> None:
        """Fit UMAP once on corpus embeddings, compute trustworthiness, and persist artifacts."""
        n_samples = embeddings.shape[0]
        effective_neighbors = max(2, min(self.n_neighbors, n_samples - 1))

        logger.info(
            "Fitting %dD UMAP projection on %d corpus embeddings (n_neighbors=%d, metric=%s)...",
            self.n_components,
            n_samples,
            effective_neighbors,
            self.metric,
        )

        import inspect

        umap_kwargs: dict[str, Any] = {
            "n_components": self.n_components,
            "n_neighbors": effective_neighbors,
            "min_dist": self.min_dist,
            "metric": self.metric,
            "random_state": self.random_state,
            "n_jobs": 1,
        }
        if "compatibility_layout" in inspect.signature(umap.UMAP.__init__).parameters:
            umap_kwargs["compatibility_layout"] = True

        reducer = umap.UMAP(**umap_kwargs)
        coords = np.asarray(reducer.fit_transform(embeddings), dtype=np.float32)

        trust_neighbors = max(1, min(effective_neighbors, (n_samples - 1) // 2))
        trust_score = float(
            sklearn_trustworthiness(
                embeddings.astype(np.float64),
                coords.astype(np.float64),
                n_neighbors=trust_neighbors,
                metric=self.metric,
            )
        )

        self.corpus_embeddings = np.asarray(embeddings, dtype=np.float32)
        self.corpus_coords_3d = coords
        self._umap_model = reducer
        self.trustworthiness = round(trust_score, 6)
        self._manifold_cache = None
        self._warmup_transform()

        logger.info(
            "UMAP fitted successfully (trustworthiness=%.4f).", self.trustworthiness
        )

        if save_artifacts:
            self.artifacts_dir.mkdir(parents=True, exist_ok=True)
            manifest_path, emb_path, coords_path, umap_path = self._artifact_paths()
            manifest_tmp = self.artifacts_dir / "manifest.json.tmp"
            # Remove stale manifest before writing new binary artifacts so an interrupted save never pairs mismatched files.
            manifest_path.unlink(missing_ok=True)

            manifest = self._expected_manifest(dataset_hash, model_name, n_samples)
            manifest["trustworthiness"] = self.trustworthiness

            np.save(emb_path, self.corpus_embeddings)
            np.save(coords_path, self.corpus_coords_3d)
            joblib.dump(self._umap_model, umap_path)
            manifest_tmp.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            manifest_tmp.replace(manifest_path)
            logger.info("Saved UMAP and embedding artifacts to %s.", self.artifacts_dir)

    def set_precomputed_state(
        self,
        *,
        embeddings: np.ndarray,
        coords_3d: np.ndarray,
        umap_model: Any,
        trustworthiness: float,
    ) -> None:
        """Inject precomputed UMAP state (primarily for unit tests)."""
        self.corpus_embeddings = np.asarray(embeddings, dtype=np.float32)
        self.corpus_coords_3d = np.asarray(coords_3d, dtype=np.float32)
        self._umap_model = umap_model
        self.trustworthiness = trustworthiness
        self._manifold_cache = None

    def _ensure_manifold_cache(self) -> dict[str, Any]:
        """Cache pairwise distances and deterministic rank structures for the current corpus fit."""
        if self._manifold_cache is not None:
            return self._manifold_cache
        if self.corpus_embeddings is None or self.corpus_coords_3d is None:
            raise EngineNotReadyError("Corpus embeddings or coordinates are not initialized.")

        n_total = int(self.corpus_embeddings.shape[0])
        sample_idx, was_sampled = deterministic_sample_indices(
            n_total, max_samples=500, seed=42
        )
        emb_s = self.corpus_embeddings[sample_idx].astype(np.float64)
        c3d_s = self.corpus_coords_3d[sample_idx].astype(np.float64)
        c2d_s = c3d_s[:, :2]

        d_high = pairwise_distances(emb_s, metric=self.metric)
        d_3d = pairwise_distances(c3d_s, metric="euclidean")
        d_2d = pairwise_distances(c2d_s, metric="euclidean")

        tri = np.triu_indices(len(sample_idx), k=1)
        cache = {
            "total_corpus_size": n_total,
            "sample_size": len(sample_idx),
            "sample_indices": sample_idx,
            "was_sampled": was_sampled,
            "sampling_seed": 42 if was_sampled else None,
            "d_high": d_high,
            "d_3d": d_3d,
            "d_2d": d_2d,
            "d_high_tri": d_high[tri],
            "d_3d_tri": d_3d[tri],
            "d_2d_tri": d_2d[tri],
            "prep_high": prepare_neighbor_ranks(d_high) if len(sample_idx) >= 2 else None,
            "prep_3d": prepare_neighbor_ranks(d_3d) if len(sample_idx) >= 2 else None,
            "prep_2d": prepare_neighbor_ranks(d_2d) if len(sample_idx) >= 2 else None,
        }
        self._manifold_cache = cache
        return cache

    def compute_corpus_fidelity_metrics(
        self,
        *,
        continuity_k: Optional[int] = None,
        overlap_k: int = 5,
        record_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Compute genuine UMAP continuity (2D/3D), 2D-vs-3D overlap, and distortion diagnostics."""
        cache = self._ensure_manifold_cache()
        n_sample = int(cache["sample_size"])
        n_total = int(cache["total_corpus_size"])
        sample_idx = cache["sample_indices"]
        sampled_ids = (
            [record_ids[int(i)] for i in sample_idx if int(i) < len(record_ids)]
            if record_ids
            else None
        )

        default_cont_k = max(1, min(self.n_neighbors, (n_sample - 1) // 2))
        eff_cont_k = continuity_k if continuity_k is not None else default_cont_k

        # Trustworthiness detail (always matches self.trustworthiness computed on the corpus fit)
        trust_k = max(1, min(self.n_neighbors, (n_total - 1) // 2)) if n_total >= 4 else 1
        trust_detail = MetricEvaluationDetail(
            value=self.trustworthiness,
            status="computed" if self.trustworthiness is not None else "unavailable",
            sample_size=n_total if self.trustworthiness is not None else 0,
            parameters={"k": trust_k, "metric": self.metric, "projection": "3D fitted UMAP"},
            methodology=(
                "sklearn.manifold.trustworthiness(embeddings_384d, coords_3d, n_neighbors=k, metric='cosine') "
                "measuring false-neighbor intrusions in 3D UMAP relative to 384D cosine space."
            ),
            limitations=(
                "Measures local precision only; does not measure Continuity (dropped true neighbors), "
                "2D (x, y) slice fidelity, or global pairwise distances."
            ),
            unavailable_reason=(
                None if self.trustworthiness is not None else "Trustworthiness not computed for UMAP fit."
            ),
        )

        c2d_res = compute_continuity_and_overlap(
            cache["d_high"],
            cache["d_2d"],
            eff_cont_k,
            high_prepared=cache["prep_high"],
            low_prepared=cache["prep_2d"],
        )
        c3d_res = compute_continuity_and_overlap(
            cache["d_high"],
            cache["d_3d"],
            eff_cont_k,
            high_prepared=cache["prep_high"],
            low_prepared=cache["prep_3d"],
        )

        sampling_params = {
            "total_corpus_size": n_total,
            "deterministic_subsample": cache["was_sampled"],
            **({"sampling_seed": cache["sampling_seed"]} if cache["was_sampled"] else {}),
        }

        continuity_2d = MetricEvaluationDetail(
            value=c2d_res["value"],
            status=c2d_res["status"],
            sample_size=c2d_res["sample_size"],
            parameters={
                "k": c2d_res["k"],
                "high_dim_metric": self.metric,
                "low_dim_metric": "euclidean_2d_xy_slice",
                "knn_recall_vs_384d": c2d_res.get("knn_recall"),
                "knn_jaccard_vs_384d": c2d_res.get("knn_jaccard"),
                **sampling_params,
            },
            methodology=(
                "Venna & Kaski continuity C(k) = 1 - [2 / (N*k*(2N-3k-1))] * sum(rank_2d(i, j) - k) "
                "over true 384D cosine k-NN dropped from the UI 2D (x, y) projection slice."
            ),
            limitations=(
                "VectiQ renders 2D views using the (x, y) slice of fitted 3D UMAP coordinates rather than refitting "
                "a separate 2D UMAP; dropping z further compresses distant clusters."
            ),
            unavailable_reason=c2d_res["reason"],
        )

        continuity_3d = MetricEvaluationDetail(
            value=c3d_res["value"],
            status=c3d_res["status"],
            sample_size=c3d_res["sample_size"],
            parameters={
                "k": c3d_res["k"],
                "high_dim_metric": self.metric,
                "low_dim_metric": "euclidean_3d_umap",
                "knn_recall_vs_384d": c3d_res.get("knn_recall"),
                "knn_jaccard_vs_384d": c3d_res.get("knn_jaccard"),
                **sampling_params,
            },
            methodology=(
                "Venna & Kaski continuity C(k) = 1 - [2 / (N*k*(2N-3k-1))] * sum(rank_3d(i, j) - k) "
                "over true 384D cosine k-NN pushed outside k-NN in fitted 3D UMAP."
            ),
            limitations=(
                "Continuity evaluates missing true neighbors in 3D UMAP (distinct from Trustworthiness, "
                "which penalizes false intruders)."
            ),
            unavailable_reason=c3d_res["reason"],
        )

        # Genuine 2D vs 3D projected neighborhood comparison + distinct 384D recalls
        ov_res = compute_2d_vs_3d_overlap(
            cache["d_2d"],
            cache["d_3d"],
            overlap_k,
            prep_2d=cache["prep_2d"],
            prep_3d=cache["prep_3d"],
            point_ids=sampled_ids,
        )
        c2d_ov = compute_continuity_and_overlap(
            cache["d_high"],
            cache["d_2d"],
            overlap_k,
            high_prepared=cache["prep_high"],
            low_prepared=cache["prep_2d"],
        )
        c3d_ov = compute_continuity_and_overlap(
            cache["d_high"],
            cache["d_3d"],
            overlap_k,
            high_prepared=cache["prep_high"],
            low_prepared=cache["prep_3d"],
        )

        overlap_detail = NeighborhoodOverlapDetail(
            value=ov_res["value"],
            status=ov_res["status"],
            sample_size=ov_res["sample_size"],
            parameters={
                "k": ov_res["k"],
                "space_a": "projected_2d_xy_euclidean",
                "space_b": "projected_3d_xyz_euclidean",
                **sampling_params,
            },
            methodology=(
                "Mean top-k visual neighbor agreement (1/N) * sum(|N_k^2D(i) ∩ N_k^3D(i)| / k) and Jaccard "
                "between Euclidean k-NN sets in 2D (x, y) and 3D (x, y, z) projections."
            ),
            limitations=(
                "Strictly measures 2D-vs-3D projected layout consistency (NOT original 384D neighbor preservation; "
                "see separate projected_vs_384d_overlap fields). High 2D-vs-3D agreement does not imply 384D fidelity."
            ),
            unavailable_reason=ov_res["reason"],
            mean_jaccard=ov_res.get("mean_jaccard"),
            min_overlap=ov_res.get("min_overlap"),
            max_overlap=ov_res.get("max_overlap"),
            projected_vs_384d_overlap_2d=c2d_ov.get("knn_recall"),
            projected_vs_384d_overlap_3d=c3d_ov.get("knn_recall"),
            point_examples=[OverlapPointExample(**ex) for ex in ov_res.get("point_examples", [])],
        )

        dist2d_res = compute_projection_distortion(
            cache["d_high_tri"], cache["d_2d_tri"], n_sample
        )
        dist3d_res = compute_projection_distortion(
            cache["d_high_tri"], cache["d_3d_tri"], n_sample
        )

        distortion_2d = ProjectionDistortionDetail(
            value=dist2d_res["value"],
            status=dist2d_res["status"],
            sample_size=dist2d_res["sample_size"],
            parameters={
                "distance_definition": "384d_cosine_vs_2d_euclidean",
                "pair_count": dist2d_res["pair_count"],
                **sampling_params,
            },
            methodology=(
                "Spearman rank correlation and Kruskal Stress-1 (optimal scaling s) over all upper-triangle pairwise "
                "distances between 384D cosine space and 2D (x, y) projection."
            ),
            limitations=(
                "UMAP optimizes local fuzzy-simplicial neighborhoods rather than global metric distances; low Spearman rho "
                "or elevated Stress-1 is expected and warns against interpreting global plot gaps linearly."
            ),
            unavailable_reason=dist2d_res["reason"],
            spearman_correlation=dist2d_res["spearman_correlation"],
            pearson_correlation=dist2d_res["pearson_correlation"],
            kruskal_stress_1=dist2d_res["kruskal_stress_1"],
            pair_count=dist2d_res["pair_count"],
        )

        distortion_3d = ProjectionDistortionDetail(
            value=dist3d_res["value"],
            status=dist3d_res["status"],
            sample_size=dist3d_res["sample_size"],
            parameters={
                "distance_definition": "384d_cosine_vs_3d_euclidean",
                "pair_count": dist3d_res["pair_count"],
                **sampling_params,
            },
            methodology=(
                "Spearman rank correlation and Kruskal Stress-1 (optimal scaling s) over all upper-triangle pairwise "
                "distances between 384D cosine space and fitted 3D (x, y, z) UMAP."
            ),
            limitations=(
                "UMAP preserves local neighborhood topology better than global Euclidean radii; all similarity math and "
                "nearest-neighbor retrieval still execute strictly in 384D."
            ),
            unavailable_reason=dist3d_res["reason"],
            spearman_correlation=dist3d_res["spearman_correlation"],
            pearson_correlation=dist3d_res["pearson_correlation"],
            kruskal_stress_1=dist3d_res["kruskal_stress_1"],
            pair_count=dist3d_res["pair_count"],
        )

        return {
            "umap_trustworthiness_detail": trust_detail,
            "umap_continuity_2d": continuity_2d,
            "umap_continuity_3d": continuity_3d,
            "neighborhood_overlap_2d_3d": overlap_detail,
            "projection_distortion_2d": distortion_2d,
            "projection_distortion_3d": distortion_3d,
        }

    def set_corpus_concept_scores(
        self, concept_scores: dict[ConceptEnum, np.ndarray]
    ) -> None:
        """Store precomputed concept scores for all corpus sentences."""
        self.corpus_concept_scores = concept_scores

    def _warmup_transform(self) -> None:
        """Warm up UMAP out-of-sample transform once at startup."""
        if self._umap_model is not None and self.corpus_embeddings is not None:
            with self._transform_lock:
                _ = self._umap_model.transform(self.corpus_embeddings[:1])

    def transform_batch(self, embeddings: np.ndarray) -> list[Coordinate3D]:
        """Project one or more 384D vectors through the fitted UMAP model."""
        if self._umap_model is None:
            raise EngineNotReadyError("UMAP projection model is not fitted.")

        arr = np.asarray(embeddings, dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)

        with self._transform_lock:
            projected = np.asarray(self._umap_model.transform(arr), dtype=np.float32)

        return [
            Coordinate3D(
                x=round(float(row[0]), 6),
                y=round(float(row[1]), 6),
                z=round(float(row[2]), 6),
            )
            for row in projected
        ]

    def transform_vector(self, embedding: np.ndarray) -> Coordinate3D:
        """Project a single 384D vector into 3D UMAP space."""
        return self.transform_batch(embedding)[0]

    def get_semantic_map(
        self,
        *,
        records: list[CorpusRecord],
        include_embeddings: bool = False,
        category: Optional[str] = None,
        sentiment: Optional[str] = None,
        emotion: Optional[str] = None,
        label_mode: Literal["human", "model"] = "human",
        search: Optional[str] = None,
        limit: int = 250,
        corpus_affect: Optional[dict[str, Any]] = None,
        human_overlays: Optional[dict[str, Any]] = None,
    ) -> SemanticMapResponse:
        """Build the SemanticMapResponse payload from cached corpus projections."""
        if not self.is_fitted or self.corpus_coords_3d is None or self.corpus_embeddings is None:
            raise EngineNotReadyError("Semantic map projection is not initialized.")

        affect_map = corpus_affect or {}
        overlay_map = human_overlays or {}
        search_term = search.strip().lower() if search and search.strip() else None

        selected_indices: list[int] = []
        for idx, rec in enumerate(records):
            if category is not None and category != "" and rec.category != category:
                continue
            affect = affect_map.get(rec.id)
            overlay = overlay_map.get(rec.id)

            model_sent = (
                ("uncertain" if affect.sentiment_is_uncertain else affect.sentiment_label.value)
                if affect is not None
                else None
            )
            human_sent_obj = getattr(overlay, "human_sentiment_label", None) if overlay is not None else None
            human_sent = (
                human_sent_obj.value
                if human_sent_obj is not None
                else (
                    "uncertain"
                    if overlay is not None and overlay.review_status.value == "flagged_uncertain"
                    else None
                )
            )
            eff_sent = (
                model_sent
                if label_mode == "model"
                else (human_sent if human_sent is not None else model_sent)
            )

            # Determine active emotion set depending on label_mode ('human' vs 'model')
            active_emotions: set[str] = set()
            if label_mode == "model":
                if affect is not None:
                    active_emotions.add(affect.emotion_label.value)
            else:
                human_dist = (
                    getattr(overlay, "human_emotion_distribution", None)
                    if overlay is not None
                    else None
                )
                if human_dist:
                    active_emotions.update(
                        d.emotion.value for d in human_dist if float(d.percentage) > 0.0
                    )
                elif overlay is not None and overlay.human_emotion_label is not None:
                    active_emotions.add(overlay.human_emotion_label.value)
                elif affect is not None:
                    active_emotions.add(affect.emotion_label.value)

            if sentiment is not None and sentiment != "" and eff_sent != sentiment:
                continue

            if emotion is not None and emotion != "" and emotion not in active_emotions:
                continue

            if search_term is not None:
                emo_tokens = " ".join(sorted(active_emotions))
                haystack_match = (
                    search_term in rec.text.lower()
                    or search_term in rec.id.lower()
                    or search_term in rec.category.lower()
                    or search_term in emo_tokens.lower()
                    or search_term in (eff_sent or "").lower()
                )
                if not haystack_match:
                    continue

            selected_indices.append(idx)
            if len(selected_indices) >= limit:
                break

        if not selected_indices:
            return SemanticMapResponse(
                total_points=0,
                bounds=MapBounds(
                    x_min=0.0, x_max=0.0, y_min=0.0, y_max=0.0, z_min=0.0, z_max=0.0
                ),
                clusters=[],
                points=[],
                umap_trustworthiness=self.trustworthiness,
            )

        selected_coords = self.corpus_coords_3d[selected_indices]
        bounds = MapBounds(
            x_min=round(float(np.min(selected_coords[:, 0])), 6),
            x_max=round(float(np.max(selected_coords[:, 0])), 6),
            y_min=round(float(np.min(selected_coords[:, 1])), 6),
            y_max=round(float(np.max(selected_coords[:, 1])), 6),
            z_min=round(float(np.min(selected_coords[:, 2])), 6),
            z_max=round(float(np.max(selected_coords[:, 2])), 6),
        )

        cluster_counts: dict[str, int] = {}
        points: list[SemanticMapPoint] = []

        for idx in selected_indices:
            rec = records[idx]
            cluster_counts[rec.category] = cluster_counts.get(rec.category, 0) + 1
            coord = self.corpus_coords_3d[idx]
            concept_scores = {
                concept: round(float(self.corpus_concept_scores[concept][idx]), 6)
                for concept in ConceptEnum
                if concept in self.corpus_concept_scores
            }
            embedding_list = (
                [round(float(v), 6) for v in self.corpus_embeddings[idx].tolist()]
                if include_embeddings
                else None
            )
            affect = affect_map.get(rec.id)
            overlay = overlay_map.get(rec.id)
            raw_human_dist = (
                getattr(overlay, "human_emotion_distribution", None)
                if overlay is not None
                else None
            ) or []
            points.append(
                SemanticMapPoint(
                    id=rec.id,
                    text=rec.text,
                    category=rec.category,
                    coordinates=Coordinate3D(
                        x=round(float(coord[0]), 6),
                        y=round(float(coord[1]), 6),
                        z=round(float(coord[2]), 6),
                    ),
                    concept_scores=concept_scores,
                    embedding=embedding_list,
                    sentiment_label=affect.sentiment_label.value if affect else None,
                    sentiment_confidence=affect.sentiment_confidence if affect else None,
                    sentiment_is_uncertain=affect.sentiment_is_uncertain if affect else None,
                    emotion_label=affect.emotion_label.value if affect else None,
                    emotion_raw_label=affect.emotion_raw_label if affect else None,
                    emotion_confidence=affect.emotion_confidence if affect else None,
                    emotion_is_uncertain=affect.emotion_is_uncertain if affect else None,
                    human_emotion_label=(
                        overlay.human_emotion_label.value
                        if overlay is not None and overlay.human_emotion_label is not None
                        else None
                    ),
                    human_emotion_distribution=[
                        SemanticMapHumanEmotionItem(
                            emotion=d.emotion.value,
                            percentage=float(d.percentage),
                        )
                        for d in raw_human_dist
                    ],
                    human_sentiment_label=(
                        overlay.human_sentiment_label.value
                        if overlay is not None
                        and getattr(overlay, "human_sentiment_label", None) is not None
                        else None
                    ),
                    confirmed_for_evaluation=(
                        bool(overlay.confirmed_for_evaluation)
                        if overlay is not None
                        else False
                    ),
                    emotion_review_status=(
                        overlay.review_status.value if overlay is not None else "unreviewed"
                    ),
                )
            )

        clusters: list[ClusterSummary] = []
        for cat_id, count in cluster_counts.items():
            label, color = DatasetService.get_cluster_style(cat_id)
            clusters.append(
                ClusterSummary(
                    id=cat_id,
                    label=label,
                    color=color,
                    point_count=count,
                )
            )

        return SemanticMapResponse(
            total_points=len(points),
            bounds=bounds,
            clusters=clusters,
            points=points,
            umap_trustworthiness=self.trustworthiness,
        )

