"""SQLite store for projected sentence affect records and percentage-based human emotion corrections."""

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
    HumanEmotionDistributionItem,
    HumanEmotionEvaluationRecord,
    HumanEmotionEvaluationSummary,
    HumanSentimentLabel,
    EmotionReviewHistoryItem,
    EmotionReviewResponse,
    HumanEmotionOverlay,
    ReviewAction,
    ReviewStatus,
    SentimentPrediction,
    pick_dominant_emotion,
    sort_distribution_desc,
    validate_confirmed_distribution,
)
from app.models.schemas import Coordinate3D

logger = get_logger(__name__)


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    """Safely add a column to an existing SQLite table if missing (idempotent migration)."""
    existing = {str(r["name"]) for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition};")


def _serialize_distribution(dist: list[HumanEmotionDistributionItem]) -> Optional[str]:
    if not dist:
        return json.dumps([])
    return json.dumps([{"emotion": item.emotion.value, "percentage": float(item.percentage)} for item in dist])


def _resolve_distribution_from_storage(
    raw_json: Optional[str],
    *,
    status: ReviewStatus,
    legacy_label: Optional[EmotionCategory],
) -> list[HumanEmotionDistributionItem]:
    """Decode stored JSON distribution or interpret legacy single-emotion annotation as 100%."""
    if raw_json is not None:
        try:
            loaded = json.loads(raw_json)
            if isinstance(loaded, list):
                parsed = [HumanEmotionDistributionItem.model_validate(item) for item in loaded]
                return sort_distribution_desc(parsed)
        except Exception as exc:
            logger.warning("Failed to parse stored human distribution JSON (%s); falling back.", exc)

    if (
        status in (ReviewStatus.confirmed, ReviewStatus.corrected)
        and legacy_label is not None
        and legacy_label != EmotionCategory.uncertain
    ):
        return [HumanEmotionDistributionItem(emotion=legacy_label, percentage=100.0)]
    return []


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
                        human_emotion_distribution_json TEXT,
                        human_sentiment_label TEXT,
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
                        revision INTEGER NOT NULL DEFAULT 1,
                        previous_status TEXT NOT NULL,
                        new_status TEXT NOT NULL,
                        previous_human_emotion TEXT,
                        new_human_emotion TEXT NOT NULL,
                        previous_human_distribution_json TEXT,
                        new_human_distribution_json TEXT,
                        previous_human_sentiment TEXT,
                        new_human_sentiment TEXT,
                        action TEXT NOT NULL,
                        rationale TEXT,
                        reviewed_at TEXT NOT NULL,
                        FOREIGN KEY (record_id) REFERENCES emotion_records(record_id) ON DELETE CASCADE
                    );
                    """
                )
                # Backward-compatible SQLite migrations for existing artifact DBs
                _ensure_column(
                    conn, "emotion_records", "human_emotion_distribution_json", "TEXT"
                )
                _ensure_column(
                    conn, "emotion_records", "human_sentiment_label", "TEXT"
                )
                _ensure_column(
                    conn, "emotion_review_history", "revision", "INTEGER NOT NULL DEFAULT 0"
                )
                _ensure_column(
                    conn, "emotion_review_history", "previous_human_distribution_json", "TEXT"
                )
                _ensure_column(
                    conn, "emotion_review_history", "new_human_distribution_json", "TEXT"
                )
                _ensure_column(
                    conn, "emotion_review_history", "previous_human_sentiment", "TEXT"
                )
                _ensure_column(
                    conn, "emotion_review_history", "new_human_sentiment", "TEXT"
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
                        created_at, review_status, human_emotion_label,
                        human_emotion_distribution_json, rationale, reviewed_at, history_count
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unreviewed', NULL, NULL, NULL, NULL, 0);
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
        human_emotion_label: Optional[EmotionCategory] = None,
        human_emotion_distribution: Optional[list[HumanEmotionDistributionItem]] = None,
        human_sentiment_label: Optional[HumanSentimentLabel] = None,
        rationale: Optional[str] = None,
    ) -> EmotionReviewResponse:
        """Store human emotion distribution and sentiment without mutating original outputs."""
        # Normalize & validate inputs strictly even when invoked directly in unit tests
        if action == ReviewAction.flag_uncertain or human_emotion_label == EmotionCategory.uncertain:
            if human_emotion_distribution:
                raise InvalidInputError(
                    "Uncertain annotations cannot include confirmed percentage distributions.",
                    details=[{"field": "human_emotion_distribution", "issue": "Must be empty when flagging uncertain."}],
                )
            resolved_dist: list[HumanEmotionDistributionItem] = []
            resolved_label = EmotionCategory.uncertain
            resolved_sentiment = (
                human_sentiment_label
                if human_sentiment_label is not None
                else HumanSentimentLabel.uncertain
            )
        elif human_emotion_distribution is not None:
            try:
                resolved_dist = validate_confirmed_distribution(human_emotion_distribution)
            except ValueError as exc:
                raise InvalidInputError(
                    str(exc),
                    details=[{"field": "human_emotion_distribution", "issue": str(exc)}],
                ) from exc
            resolved_label = pick_dominant_emotion(resolved_dist, preferred=human_emotion_label)
            resolved_sentiment = human_sentiment_label
        elif human_emotion_label is not None:
            resolved_label = human_emotion_label
            resolved_dist = [
                HumanEmotionDistributionItem(emotion=human_emotion_label, percentage=100.0)
            ]
            resolved_sentiment = human_sentiment_label
        else:
            raise InvalidInputError(
                "Either human_emotion_distribution totaling 100% or human_emotion_label is required.",
                details=[{"field": "human_emotion_distribution", "issue": "Missing human emotion distribution."}],
            )

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
                prev_human_sentiment = (
                    HumanSentimentLabel(row["human_sentiment_label"])
                    if "human_sentiment_label" in row.keys() and row["human_sentiment_label"]
                    else None
                )
                prev_dist = _resolve_distribution_from_storage(
                    row["human_emotion_distribution_json"],
                    status=prev_status,
                    legacy_label=prev_human,
                )
                orig_label = str(row["original_emotion_label"])
                orig_sent = SentimentPrediction.model_validate(
                    json.loads(row["original_sentiment_json"])
                )
                orig_eff_sent = (
                    "uncertain" if orig_sent.is_uncertain else orig_sent.predicted_label.value
                )

                nonzero_entries = [d for d in resolved_dist if d.percentage > 0.0]
                is_exact_single_match = (
                    len(nonzero_entries) == 1 and nonzero_entries[0].emotion.value == orig_label
                )
                sent_matches_original = (
                    resolved_sentiment is None or resolved_sentiment.value == orig_eff_sent
                )

                if action == ReviewAction.flag_uncertain or resolved_label == EmotionCategory.uncertain:
                    new_status = ReviewStatus.flagged_uncertain
                elif is_exact_single_match and sent_matches_original:
                    new_status = ReviewStatus.confirmed
                else:
                    new_status = ReviewStatus.corrected

                now_iso = utc_timestamp_iso()
                prev_count = int(row["history_count"])
                next_revision = prev_count + 1
                cleaned_rationale = rationale.strip() if rationale else None
                new_dist_json = _serialize_distribution(resolved_dist)
                prev_dist_json = _serialize_distribution(prev_dist) if prev_human else None

                # Update ONLY human review overlay fields; original prediction & coordinates remain immutable
                conn.execute(
                    """
                    UPDATE emotion_records
                    SET review_status = ?,
                        human_emotion_label = ?,
                        human_emotion_distribution_json = ?,
                        human_sentiment_label = ?,
                        rationale = ?,
                        reviewed_at = ?,
                        history_count = ?
                    WHERE record_id = ?
                    """,
                    (
                        new_status.value,
                        resolved_label.value,
                        new_dist_json,
                        resolved_sentiment.value if resolved_sentiment else None,
                        cleaned_rationale,
                        now_iso,
                        next_revision,
                        record_id,
                    ),
                )
                conn.execute(
                    """
                    INSERT INTO emotion_review_history (
                        history_id, record_id, revision, previous_status, new_status,
                        previous_human_emotion, new_human_emotion,
                        previous_human_distribution_json, new_human_distribution_json,
                        previous_human_sentiment, new_human_sentiment,
                        action, rationale, reviewed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        record_id,
                        next_revision,
                        prev_status.value,
                        new_status.value,
                        prev_human.value if prev_human else None,
                        resolved_label.value,
                        prev_dist_json,
                        new_dist_json,
                        prev_human_sentiment.value if prev_human_sentiment else None,
                        resolved_sentiment.value if resolved_sentiment else None,
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

    def compute_evaluation_summary(self) -> HumanEmotionEvaluationSummary:
        """Compute multi-label evaluation over confirmed/corrected records only (excluding uncertain/unreviewed)."""
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM emotion_records ORDER BY created_at DESC"
                ).fetchall()

        total_records = len(rows)
        confirmed_count = 0
        corrected_count = 0
        excluded_uncertain_count = 0
        excluded_unreviewed_count = 0
        eval_records: list[HumanEmotionEvaluationRecord] = []

        for row in rows:
            overlay = self._row_to_overlay(row)
            status = overlay.review_status
            if status == ReviewStatus.unreviewed:
                excluded_unreviewed_count += 1
                continue
            if status == ReviewStatus.flagged_uncertain or not overlay.confirmed_for_evaluation:
                excluded_uncertain_count += 1
                continue

            if status == ReviewStatus.confirmed:
                confirmed_count += 1
            elif status == ReviewStatus.corrected:
                corrected_count += 1

            orig_emotion = EmotionPrediction.model_validate(
                json.loads(row["original_emotion_json"])
            )
            orig_sentiment = SentimentPrediction.model_validate(
                json.loads(row["original_sentiment_json"])
            )
            human_dist = overlay.human_emotion_distribution
            dominant_human = overlay.human_emotion_label or pick_dominant_emotion(human_dist)
            nonzero_emotions = {d.emotion for d in human_dist if d.percentage > 0.0}
            is_mixed = len(nonzero_emotions) > 1
            dominant_agreement = orig_emotion.predicted_emotion == dominant_human
            top1_in_human = orig_emotion.predicted_emotion in nonzero_emotions

            # Aggregate original GoEmotions sigmoid scores by category and normalize strictly for comparison
            cat_scores: dict[EmotionCategory, float] = {}
            for item in orig_emotion.probabilities:
                cat_scores[item.category] = cat_scores.get(item.category, 0.0) + float(item.probability)
            score_sum = sum(cat_scores.values())
            model_norm = (
                {k: v / score_sum for k, v in cat_scores.items()} if score_sum > 0.0 else {}
            )
            human_prop = {d.emotion: d.percentage / 100.0 for d in human_dist}
            overlap = sum(
                min(model_norm.get(cat, 0.0), human_prop.get(cat, 0.0))
                for cat in set(model_norm) | set(human_prop)
            )
            overlap_clamped = round(min(1.0, max(0.0, float(overlap))), 4)

            eval_records.append(
                HumanEmotionEvaluationRecord(
                    record_id=str(row["record_id"]),
                    input_text=str(row["input_text"]),
                    review_status=status,
                    model_predicted_emotion=orig_emotion.predicted_emotion,
                    model_confidence=round(float(orig_emotion.confidence), 6),
                    model_predicted_sentiment=orig_sentiment.predicted_label,
                    dominant_human_emotion=dominant_human,
                    human_emotion_distribution=human_dist,
                    human_sentiment_label=overlay.human_sentiment_label,
                    is_mixed_human_distribution=is_mixed,
                    dominant_agreement=dominant_agreement,
                    model_top1_in_human_multilabel=top1_in_human,
                    soft_overlap_score=overlap_clamped,
                    reviewed_at=overlay.reviewed_at,
                    revision=overlay.revision,
                )
            )

        confirmed_gt = len(eval_records)
        mixed_count = sum(1 for r in eval_records if r.is_mixed_human_distribution)
        single_count = confirmed_gt - mixed_count

        dominant_acc = (
            round(sum(1 for r in eval_records if r.dominant_agreement) / confirmed_gt, 4)
            if confirmed_gt > 0
            else None
        )
        multilabel_cov = (
            round(
                sum(1 for r in eval_records if r.model_top1_in_human_multilabel) / confirmed_gt,
                4,
            )
            if confirmed_gt > 0
            else None
        )
        mean_overlap = (
            round(sum(r.soft_overlap_score for r in eval_records) / confirmed_gt, 4)
            if confirmed_gt > 0
            else None
        )

        return HumanEmotionEvaluationSummary(
            total_records=total_records,
            confirmed_ground_truth_count=confirmed_gt,
            confirmed_count=confirmed_count,
            corrected_count=corrected_count,
            excluded_uncertain_count=excluded_uncertain_count,
            excluded_unreviewed_count=excluded_unreviewed_count,
            mixed_distribution_count=mixed_count,
            single_emotion_count=single_count,
            dominant_top1_agreement=dominant_acc,
            multilabel_target_coverage=multilabel_cov,
            mean_soft_distribution_overlap=mean_overlap,
            methodology=(
                "Evaluates unmodified transformer predictions against complete human-confirmed percentage "
                "distributions over records with status 'confirmed' or 'corrected'. Reports: (1) dominant "
                "top-1 exact match, (2) multi-label target coverage checking whether the model prediction "
                "appears in any human-annotated emotion (>0%), and (3) soft histogram intersection over "
                "compositional human weights (pct/100) vs category-aggregated model outputs."
            ),
            limitations=(
                "Human percentages express compositional annotator target proportions summing to 100%, never "
                "classifier confidence scores. Records marked 'flagged_uncertain' or 'unreviewed' are strictly "
                "excluded from confirmed ground-truth metrics."
            ),
            records=eval_records,
        )

    @staticmethod
    def _row_to_overlay(row: sqlite3.Row) -> HumanEmotionOverlay:
        status = ReviewStatus(row["review_status"])
        r_keys = row.keys()
        hl_raw = row["human_emotion_label"]
        legacy_label = EmotionCategory(hl_raw) if hl_raw else None
        raw_dist_json = (
            row["human_emotion_distribution_json"]
            if "human_emotion_distribution_json" in r_keys
            else None
        )
        sent_raw = row["human_sentiment_label"] if "human_sentiment_label" in r_keys else None
        human_sent = HumanSentimentLabel(sent_raw) if sent_raw else None
        dist = _resolve_distribution_from_storage(
            raw_dist_json,
            status=status,
            legacy_label=legacy_label,
        )
        if status == ReviewStatus.flagged_uncertain:
            dist = []
            if human_sent is None:
                human_sent = HumanSentimentLabel.uncertain
        dominant = (
            pick_dominant_emotion(dist, preferred=legacy_label)
            if dist
            else legacy_label
        )
        confirmed_eval = status in (ReviewStatus.confirmed, ReviewStatus.corrected) and len(dist) > 0
        history_count = int(row["history_count"])
        return HumanEmotionOverlay(
            review_status=status,
            human_emotion_label=dominant,
            human_emotion_distribution=dist,
            human_sentiment_label=human_sent,
            confirmed_for_evaluation=confirmed_eval,
            rationale=row["rationale"],
            reviewed_at=row["reviewed_at"],
            revision=history_count,
            history_count=history_count,
        )

    @classmethod
    def _build_review_response(
        cls, row: sqlite3.Row, hist_rows: list[sqlite3.Row]
    ) -> EmotionReviewResponse:
        history_items: list[EmotionReviewHistoryItem] = []
        for idx, h in enumerate(hist_rows, start=1):
            prev_status = ReviewStatus(h["previous_status"])
            new_status = ReviewStatus(h["new_status"])
            prev_hl = EmotionCategory(h["previous_human_emotion"]) if h["previous_human_emotion"] else None
            new_hl = EmotionCategory(h["new_human_emotion"])
            h_keys = h.keys()
            rev = int(h["revision"]) if "revision" in h_keys and int(h["revision"]) > 0 else idx
            prev_sent = (
                HumanSentimentLabel(h["previous_human_sentiment"])
                if "previous_human_sentiment" in h_keys and h["previous_human_sentiment"]
                else None
            )
            new_sent = (
                HumanSentimentLabel(h["new_human_sentiment"])
                if "new_human_sentiment" in h_keys and h["new_human_sentiment"]
                else None
            )
            prev_dist = (
                _resolve_distribution_from_storage(
                    h["previous_human_distribution_json"],
                    status=prev_status,
                    legacy_label=prev_hl,
                )
                if "previous_human_distribution_json" in h_keys and prev_hl is not None
                else _resolve_distribution_from_storage(None, status=prev_status, legacy_label=prev_hl)
            )
            new_dist = (
                _resolve_distribution_from_storage(
                    h["new_human_distribution_json"],
                    status=new_status,
                    legacy_label=new_hl,
                )
                if "new_human_distribution_json" in h_keys
                else _resolve_distribution_from_storage(None, status=new_status, legacy_label=new_hl)
            )
            history_items.append(
                EmotionReviewHistoryItem(
                    history_id=str(h["history_id"]),
                    record_id=str(h["record_id"]),
                    revision=rev,
                    previous_status=prev_status,
                    new_status=new_status,
                    previous_human_emotion=prev_hl,
                    new_human_emotion=new_hl,
                    previous_human_distribution=prev_dist,
                    new_human_distribution=new_dist,
                    previous_human_sentiment=prev_sent,
                    new_human_sentiment=new_sent,
                    action=ReviewAction(h["action"]),
                    rationale=h["rationale"],
                    reviewed_at=str(h["reviewed_at"]),
                )
            )

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
            history=history_items,
        )
