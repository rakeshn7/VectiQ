"""Application service container managing startup lifecycle and shared instances."""

from typing import Optional

from app.core.config import Settings
from app.core.exceptions import EngineNotReadyError
from app.core.logging import get_logger
from app.services.dataset_service import DatasetService
from app.services.embedding_service import EmbeddingService
from app.services.evaluation_service import EvaluationService
from app.services.semantic_map_service import SemanticMapService
from app.services.similarity_service import SimilarityService
from app.services.steering_service import SteeringService

logger = get_logger(__name__)


class ServiceContainer:
    """Holds initialized singleton ML and domain services for FastAPI."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.dataset_service = DatasetService(settings.dataset_path)
        self.embedding_service = EmbeddingService(
            model_name=settings.model_name,
            expected_dimension=settings.embedding_dimension,
        )
        self.steering_service = SteeringService(
            expected_dimension=settings.embedding_dimension
        )
        self.semantic_map_service = SemanticMapService(
            artifacts_dir=settings.artifacts_dir,
            n_components=settings.umap_dimensions,
            n_neighbors=settings.umap_n_neighbors,
            min_dist=settings.umap_min_dist,
            metric=settings.umap_metric,
            random_state=settings.umap_random_state,
        )
        self.similarity_service = SimilarityService()
        self.evaluation_service = EvaluationService(
            dataset_service=self.dataset_service,
            embedding_service=self.embedding_service,
            steering_service=self.steering_service,
            semantic_map_service=self.semantic_map_service,
            similarity_service=self.similarity_service,
        )
        self.startup_error: Optional[str] = None

    @property
    def is_ready(self) -> bool:
        """Return True when embedding model, steering directions, and UMAP are ready."""
        return (
            self.startup_error is None
            and self.embedding_service.is_loaded
            and self.steering_service.is_ready
            and self.semantic_map_service.is_fitted
        )

    def ensure_ready(self) -> None:
        """Raise 503 EngineNotReadyError if the backend ML pipeline is unavailable."""
        if not self.is_ready:
            detail = self.startup_error or "Model or UMAP projection is not initialized."
            raise EngineNotReadyError(detail)

    def initialize(self, save_artifacts: bool = True) -> None:
        """Load dataset, embedding model, corpus embeddings, steering directions, and UMAP."""
        try:
            self.startup_error = None
            records = self.dataset_service.load()
            self.embedding_service.load_model()

            loaded_cache = self.semantic_map_service.try_load_cached_artifacts(
                dataset_hash=self.dataset_service.dataset_hash,
                model_name=self.settings.model_name,
                corpus_size=len(records),
            )
            if not loaded_cache:
                logger.info(
                    "Encoding %d corpus sentences with '%s'...",
                    len(records),
                    self.settings.model_name,
                )
                corpus_embeddings = self.embedding_service.encode_batch(
                    self.dataset_service.texts
                )
                self.semantic_map_service.fit_and_save(
                    embeddings=corpus_embeddings,
                    dataset_hash=self.dataset_service.dataset_hash,
                    model_name=self.settings.model_name,
                    save_artifacts=save_artifacts,
                )

            assert self.semantic_map_service.corpus_embeddings is not None
            self.steering_service.fit_directions(
                self.dataset_service,
                self.semantic_map_service.corpus_embeddings,
            )
            corpus_scores = self.steering_service.compute_corpus_concept_scores(
                self.semantic_map_service.corpus_embeddings
            )
            self.semantic_map_service.set_corpus_concept_scores(corpus_scores)
            logger.info("VectiQ ML pipeline initialized and ready.")
        except Exception as exc:
            self.startup_error = str(exc)
            logger.exception("Failed to initialize VectiQ ML pipeline: %s", exc)
            raise

