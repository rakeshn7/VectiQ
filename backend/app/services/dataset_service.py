"""Dataset loading and validation service for VectiQ reference corpus."""

from dataclasses import dataclass
import hashlib
from pathlib import Path

import pandas as pd

from app.core.logging import get_logger
from app.models.schemas import ConceptEnum

logger = get_logger(__name__)

REQUIRED_COLUMNS = {
    "id",
    "text",
    "category",
    "sentiment_anchor",
    "technical_anchor",
    "formal_anchor",
}

CLUSTER_METADATA: dict[str, tuple[str, str]] = {
    "sentiment": ("Sentiment Domain", "#38bdf8"),
    "technical": ("Engineering & Computing", "#a855f7"),
    "formal": ("Corporate & Legal", "#10b981"),
    "casual": ("Casual & Everyday", "#f59e0b"),
    "education": ("Education & Research", "#ec4899"),
    "business": ("Business & Strategy", "#6366f1"),
}

CONCEPT_ANCHOR_COLUMN: dict[ConceptEnum, str] = {
    ConceptEnum.positive_sentiment: "sentiment_anchor",
    ConceptEnum.technical_tone: "technical_anchor",
    ConceptEnum.formal_tone: "formal_anchor",
}


@dataclass(frozen=True)
class CorpusRecord:
    """Single validated sentence record from the reference corpus."""

    id: str
    text: str
    category: str
    sentiment_anchor: str = ""
    technical_anchor: str = ""
    formal_anchor: str = ""


class DatasetService:
    """Loads, validates, and indexes the curated semantic reference dataset."""

    def __init__(self, dataset_path: Path) -> None:
        self.dataset_path = dataset_path
        self.records: list[CorpusRecord] = []
        self.dataset_hash: str = ""

    def load(self) -> list[CorpusRecord]:
        """Load and validate corpus records from CSV."""
        if not self.dataset_path.exists():
            raise FileNotFoundError(f"Dataset file not found: {self.dataset_path}")

        raw_bytes = self.dataset_path.read_bytes()
        self.dataset_hash = hashlib.sha256(raw_bytes).hexdigest()

        df = pd.read_csv(self.dataset_path, dtype=str, keep_default_na=False)
        missing_cols = REQUIRED_COLUMNS - set(df.columns)
        if missing_cols:
            raise ValueError(
                f"Dataset CSV missing required columns: {sorted(missing_cols)}"
            )

        records: list[CorpusRecord] = []
        seen_ids: set[str] = set()
        seen_texts: set[str] = set()

        for row in df.itertuples(index=False):
            record_id = str(row.id).strip()
            text = str(row.text).strip()
            category = str(row.category).strip()

            if not record_id or not text or not category:
                raise ValueError(
                    f"Dataset contains empty id, text, or category near id='{record_id}'."
                )
            if record_id in seen_ids:
                raise ValueError(f"Duplicate corpus ID detected: '{record_id}'.")

            normalized_text = text.casefold()
            if normalized_text in seen_texts:
                raise ValueError(f"Duplicate corpus sentence detected: '{text}'.")

            seen_ids.add(record_id)
            seen_texts.add(normalized_text)

            records.append(
                CorpusRecord(
                    id=record_id,
                    text=text,
                    category=category,
                    sentiment_anchor=str(row.sentiment_anchor).strip(),
                    technical_anchor=str(row.technical_anchor).strip(),
                    formal_anchor=str(row.formal_anchor).strip(),
                )
            )

        if not records:
            raise ValueError("Loaded dataset contains zero records.")

        self.records = records
        logger.info(
            "Loaded %d unique corpus records from %s (sha256=%s).",
            len(self.records),
            self.dataset_path,
            self.dataset_hash[:12],
        )
        return self.records

    @property
    def size(self) -> int:
        """Return number of loaded corpus sentences."""
        return len(self.records)

    @property
    def texts(self) -> list[str]:
        """Return ordered list of corpus texts."""
        return [record.text for record in self.records]

    def get_concept_anchor_indices(
        self, concept: ConceptEnum
    ) -> tuple[list[int], list[int]]:
        """Return (positive_indices, negative_indices) for a steering concept."""
        column = CONCEPT_ANCHOR_COLUMN[concept]
        positive_indices: list[int] = []
        negative_indices: list[int] = []

        for idx, record in enumerate(self.records):
            tag = getattr(record, column)
            if tag == "positive":
                positive_indices.append(idx)
            elif tag == "negative":
                negative_indices.append(idx)

        if not positive_indices or not negative_indices:
            raise ValueError(
                f"Concept '{concept.value}' requires both positive and negative anchor examples."
            )
        return positive_indices, negative_indices

    @staticmethod
    def get_cluster_style(category: str) -> tuple[str, str]:
        """Return display label and hex color for a corpus category."""
        return CLUSTER_METADATA.get(
            category, (category.replace("_", " ").title(), "#94a3b8")
        )

