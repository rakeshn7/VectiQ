"""Cosine similarity and nearest-neighbor retrieval service in 384D space."""

from typing import Optional

import numpy as np

from app.core.exceptions import EngineNotReadyError, InvalidInputError
from app.models.schemas import Coordinate3D, NearestNeighborItem
from app.services.dataset_service import CorpusRecord
from app.services.embedding_service import safe_l2_normalize


class SimilarityService:
    """Finds top-k nearest semantic neighbors using exact 384D cosine similarity."""

    def find_nearest_neighbors(
        self,
        *,
        query_embedding: np.ndarray,
        records: list[CorpusRecord],
        corpus_embeddings: np.ndarray,
        corpus_coords_3d: np.ndarray,
        top_k: int = 5,
        exclude_text: Optional[str] = None,
    ) -> list[NearestNeighborItem]:
        """Return top-k nearest corpus items ranked descending by 384D cosine similarity."""
        if corpus_embeddings is None or corpus_coords_3d is None or not records:
            raise EngineNotReadyError("Corpus embeddings are not available.")

        if top_k < 1:
            raise InvalidInputError(
                "top_k_neighbors must be at least 1.",
                details=[{"field": "top_k_neighbors", "issue": "must be >= 1", "value": top_k}],
            )

        query_norm = safe_l2_normalize(query_embedding)
        corpus_norm = safe_l2_normalize(corpus_embeddings)

        cosine_sims = np.clip(corpus_norm @ query_norm, -1.0, 1.0)
        euclidean_dists = np.linalg.norm(corpus_norm - query_norm, axis=1)

        excluded_folded = exclude_text.strip().casefold() if exclude_text else None

        sorted_indices = np.argsort(-cosine_sims, kind="mergesort")
        neighbors: list[NearestNeighborItem] = []

        for idx in sorted_indices:
            record = records[int(idx)]
            if excluded_folded is not None and record.text.strip().casefold() == excluded_folded:
                continue

            coord = corpus_coords_3d[int(idx)]
            neighbors.append(
                NearestNeighborItem(
                    id=record.id,
                    text=record.text,
                    category=record.category,
                    cosine_similarity=round(float(cosine_sims[int(idx)]), 6),
                    euclidean_distance=round(float(euclidean_dists[int(idx)]), 6),
                    coordinates=Coordinate3D(
                        x=round(float(coord[0]), 6),
                        y=round(float(coord[1]), 6),
                        z=round(float(coord[2]), 6),
                    ),
                )
            )
            if len(neighbors) >= top_k:
                break

        return neighbors

