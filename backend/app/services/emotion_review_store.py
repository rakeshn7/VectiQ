"""SQLite store for projected sentence affect records and timestamped human emotion corrections."""

from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
import threading
from typing import Iterator, Optional
import uuid

from app.core.exceptions import InvalidInputError, utc_timestamp_iso
from app.core.logging import get_logger
from app.models.emotion_schemas import (
    EmotionCategory,
    EmotionPrediction,
    EmotionReviewHistoryItem,
    EmotionReviewResponse,
    HumanEmotionOverlay,
    ReviewAction,
    ReviewStatus,
    SentimentPrediction,
)
from app.models.schemas import Coordinate3D

logger = get_logger(__name__)


class EmotionReviewStore:
    """Thread-safe SQLite store keeping original model outputs and UMAP coordinates strictly immutable."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._lock = threading.Lock()
        self.initialize()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            with self._connect() as conn:
                conn.execute("PRAGMA journal_mode=WAL;")
                conn.execute("PRAGMA foreign_keys=ON;")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS emotion_records (
                        record_id TEXT PRIMARY KEY,
                        input_text TEXT NOT NULL,
                        original_sentiment_json TEXT NOT NULL,
                        original_emotion_json TEXT NOT NULL,
                        original_emotion_label TEXT NOT NULL,
                        original_raw_emotion_label TEXT NOT NULL,
                        original_confidence REAL NOT NULL,
                        coord_x REAL NOT NULL,
                        coord_y REAL NOT NULL,
                        coord_z REAL NOT NULL,
                        created_at TEXT NOT NULL,
                        review_status TEXT NOT NULL DEFAULT 'unreviewed',
                        human_emotion_label TEXT,
                        rationale TEXT,
                        reviewed_at TEXT,
                        history_count INTEGER NOT NULL DEFAULT 0
                    );
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS emotion_review_history (
                        history_id TEXT PRIMARY KEY,
                        record_id TEXT NOT NULL,
                        previous_status TEXT NOT NULL,
                        new_status TEXT NOT NULL,
                        previous_human_emotion TEXT,
                        new_human_emotion TEXT NOT NULL,
                        action TEXT NOT NULL,
                        rationale TEXT,
                        reviewed_at TEXT NOT NULL,
                        FOREIGN KEY (record_id) REFERENCES emotion_records(record_id) ON DELETE CASCADE
                    );
                    """
                )
        logger.info("Initialized SQLite emotion review store at %s", self.db_path)

    def create_or_get_record(
        self,
        *,
        record_id: Optional[str],
        input_text: str,
        sentiment: SentimentPrediction,
        emotion: EmotionPrediction,
        coordinates: Coordinate3D,
    ) -> tuple[str, HumanEmotionOverlay, str]:
        """Insert a frozen original record (or preserve existing if keyed cleanly) without overwriting model outputs."""
        rid = record_id or str(uuid.uuid4())
        now_iso = utc_timestamp_iso()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO emotion_records (
                        record_id, input_text,
                        original_sentiment_json, original_emotion_json,
                        original_emotion_label, original_raw_emotion_label,
                        original_confidence, coord_x, coord_y, coord_z,
                        created_at, review_status, human_emotion_label, rationale, reviewed_at, history_count
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', NULL, NULL, NULL, 0);
                    """,
                    (
                        rid,
                        input_text,
                        sentiment.model_dump_json(),
                        emotion.model_dump_json(),
                        emotion.predicted_emotion.value,
                        emotion.raw_top_label,
                        float(emotion.confidence),
                        float(coordinates.x),
                        float(coordinates.y),
                        float(coordinates.z),
                        now_iso,
                    ),
                )
                row = conn.execute(
                    "SELECT * FROM emotion_records WHERE record_id = ?", (rid,)
                ).fetchone()
                assert row is not None
                return rid, self._row_to_overlay(row), str(row["created_at"])

    def submit_review(
        self,
        *,
        record_id: str,
        action: ReviewAction,
        human_emotion_label: EmotionCategory,
        rationale: Optional[str],
    ) -> EmotionReviewResponse:
        """Store human confirmation/correction separately while keeping original model outputs & UMAP coords intact."""
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM emotion_records WHERE record_id = ?", (record_id,)
                ).fetchone()
                if row is None:
                    raise InvalidInputError(
                        f"Emotion analysis record '{record_id}' was not found.",
                        details=[{"field": "record_id", "issue": "Unknown record ID."}],
                    )

                prev_status = ReviewStatus(row["review_status"])
                prev_human = (
                    EmotionCategory(row["human_emotion_label"])
                    if row["human_emotion_label"]
                    else None
                )
                orig_label = str(row["original_emotion_label"])

                if action == ReviewAction.flag_uncertain or human_emotion_label == EmotionCategory.uncertain:
                    new_status = ReviewStatus.flagged_uncertain
                elif action == ReviewAction.confirm and human_emotion_label.value == orig_label:
                    new_status = ReviewStatus.confirmed
                elif human_emotion_label.value == orig_label and action != ReviewAction.correct:
                    new_status = ReviewStatus.confirmed
                elif human_emotion_label.value == orig_label:
                    new_status = ReviewStatus.confirmed
                else:
                    new_status = ReviewStatus.corrected

                now_iso = utc_timestamp_iso()
                prev_count = int(row["history_count"])
                cleaned_rationale = rationale.strip() if rationale else None

                # Update ONLY human review overlay fields; original prediction & coordinates remain immutable
                conn.execute(
                    """
                    UPDATE emotion_records
                    SET review_status = ?,
                        human_emotion_label = ?,
                        rationale = ?,
                        reviewed_at = ?,
                        history_count = ?
                    WHERE record_id = ?
                    """,
                    (
                        new_status.value,
                        human_emotion_label.value,
                        cleaned_rationale,
                        now_iso,
                        prev_count + 1,
                        record_id,
                    ),
                )
                conn.execute(
                    """
                    INSERT INTO emotion_review_history (
                        history_id, record_id, previous_status, new_status,
                        previous_human_emotion, new_human_emotion, action, rationale, reviewed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        record_id,
                        prev_status.value,
                        new_status.value,
                        prev_human.value if prev_human else None,
                        human_emotion_label.value,
                        action.value,
                        cleaned_rationale,
                        now_iso,
                    ),
                )

                updated = conn.execute(
                    "SELECT * FROM emotion_records WHERE record_id = ?", (record_id,)
                ).fetchone()
                hist_rows = conn.execute(
                    "SELECT * FROM emotion_review_history WHERE record_id = ? ORDER BY rowid ASC",
                    (record_id,),
                ).fetchall()
                return self._build_review_response(updated, hist_rows)

    def get_review(self, record_id: str) -> EmotionReviewResponse:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM emotion_records WHERE record_id = ?", (record_id,)
                ).fetchone()
                if row is None:
                    raise InvalidInputError(
                        f"Emotion analysis record '{record_id}' was not found.",
                        details=[{"field": "record_id", "issue": "Unknown record ID."}],
                    )
                hist_rows = conn.execute(
                    "SELECT * FROM emotion_review_history WHERE record_id = ? ORDER BY rowid ASC",
                    (record_id,),
                ).fetchall()
                return self._build_review_response(row, hist_rows)

    def list_human_overlays(self) -> dict[str, HumanEmotionOverlay]:
        """Return human review overlays keyed cleanly by record_id (e.g. corp_*)."""
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM emotion_records WHERE review_status != 'unreviewed'"
                ).fetchall()
                return {str(r["record_id"]): self._row_to_overlay(r) for r in rows}

    @staticmethod
    def _row_to_overlay(row: sqlite3.Row) -> HumanEmotionOverlay:
        hl = row["human_emotion_label"]
        return HumanEmotionOverlay(
            review_status=ReviewStatus(row["review_status"]),
            human_emotion_label=EmotionCategory(hl) if hl else None,
            rationale=row["rationale"],
            reviewed_at=row["reviewed_at"],
            history_count=int(row["history_count"]),
        )

    @classmethod
    def _build_review_response(
        cls, row: sqlite3.Row, hist_rows: list[sqlite3.Row]
    ) -> EmotionReviewResponse:
        return EmotionReviewResponse(
            record_id=str(row["record_id"]),
            input_text=str(row["input_text"]),
            original_sentiment=SentimentPrediction.model_validate(
                json.loads(row["original_sentiment_json"])
            ),
            original_emotion=EmotionPrediction.model_validate(
                json.loads(row["original_emotion_json"])
            ),
            umap_coordinates=Coordinate3D(
                x=float(row["coord_x"]),
                y=float(row["coord_y"]),
                z=float(row["coord_z"]),
            ),
            review=cls._row_to_overlay(row),
            history=[
                EmotionReviewHistoryItem(
                    history_id=str(h["history_id"]),
                    record_id=str(h["record_id"]),
                    previous_status=ReviewStatus(h["previous_status"]),
                    new_status=ReviewStatus(h["new_status"]),
                    previous_human_emotion=(
                        EmotionCategory(h["previous_human_emotion"])
                        if h["previous_human_emotion"]
                        else None
                    ),
                    new_human_emotion=EmotionCategory(h["new_human_emotion"]),
                    action=ReviewAction(h["action"]),
                    rationale=h["rationale"],
                    reviewed_at=str(h["reviewed_at"]),
                )
                for h in hist_rows
            ],
        )
