"""UMAP dimensionality reduction, artifact caching, and semantic map assembly."""

import json
from pathlib import Path
import threading
from typing import Any, Optional

import joblib
import numpy as np
from sklearn.manifold import trustworthiness as sklearn_trustworthiness
import umap

from app.core.exceptions import EngineNotReadyError
from app.core.logging import get_logger
from app.models.schemas import (
    ClusterSummary,
    ConceptEnum,
    Coordinate3D,
    MapBounds,
    SemanticMapPoint,
    SemanticMapResponse,
)
from app.services.dataset_service import CorpusRecord, DatasetService

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
        self._warmup_transform()

        logger.info(
            "UMAP fitted successfully (trustworthiness=%.4f).", self.trustworthiness
        )

        if save_artifacts:
            self.artifacts_dir.mkdir(parents=True, exist_ok=True)
            manifest_path, emb_path, coords_path, umap_path = self._artifact_paths()
            manifest = self._expected_manifest(dataset_hash, model_name, n_samples)
            manifest["trustworthiness"] = self.trustworthiness

            np.save(emb_path, self.corpus_embeddings)
            np.save(coords_path, self.corpus_coords_3d)
            joblib.dump(self._umap_model, umap_path)
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
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
        limit: int = 250,
    ) -> SemanticMapResponse:
        """Build the SemanticMapResponse payload from cached corpus projections."""
        if not self.is_fitted or self.corpus_coords_3d is None or self.corpus_embeddings is None:
            raise EngineNotReadyError("Semantic map projection is not initialized.")

        selected_indices = [
            idx
            for idx, rec in enumerate(records)
            if category is None or rec.category == category
        ][:limit]

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

