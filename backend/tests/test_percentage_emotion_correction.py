"""Comprehensive acceptance & validation tests for percentage-based human emotion corrections."""

from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.models.schemas import Coordinate3D
from app.services.affect_analysis_service import AffectAnalysisService
from app.services.container import ServiceContainer
from app.services.emotion_review_store import EmotionReviewStore
from tests.conftest import FakeEmotionBackend, FakeSentimentBackend


def _create_sentence_record(client: TestClient, text: str = "I am genuinely torn about today's results.") -> dict:
    resp = client.post(
        "/api/v1/emotions/analyze",
        json={"text": text, "concept": "positive_sentiment", "top_k_neighbors": 5},
    )
    assert resp.status_code == 200
    return resp.json()


def test_single_two_and_three_emotion_distributions_sum_to_100(client: TestClient) -> None:
    """Validate 1-emotion (100%), 2-emotion (100%), and 3-emotion (60/25/15) human distributions."""
    base = _create_sentence_record(client, "Mixed feelings about shipping the release tonight.")
    rid = base["record_id"]
    orig_emotion = base["emotion"]
    orig_sentiment = base["sentiment"]
    orig_coords = base["embedding_info"]["umap_coordinates"]

    # 1. Single emotion at 100%
    r1 = client.post(
        "/api/v1/emotions/reviews",
        json={
            "record_id": rid,
            "action": "correct",
            "human_emotion_distribution": [{"emotion": "anger", "percentage": 100}],
            "rationale": "Single emotion correction at 100%.",
        },
    )
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["review"]["human_emotion_label"] == "anger"
    assert b1["review"]["human_emotion_distribution"] == [{"emotion": "anger", "percentage": 100.0}]
    assert b1["review"]["confirmed_for_evaluation"] is True
    assert b1["original_emotion"] == orig_emotion
    assert b1["original_sentiment"] == orig_sentiment
    assert b1["umap_coordinates"] == orig_coords

    # 2. Two-emotion distribution totaling 100%
    r2 = client.post(
        "/api/v1/emotions/reviews",
        json={
            "record_id": rid,
            "action": "correct",
            "human_emotion_distribution": [
                {"emotion": "joy", "percentage": 70},
                {"emotion": "love", "percentage": 30},
            ],
            "rationale": "Two-emotion blend.",
        },
    )
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["review"]["review_status"] == "corrected"
    assert b2["review"]["human_emotion_label"] == "joy"
    assert b2["review"]["human_emotion_distribution"] == [
        {"emotion": "joy", "percentage": 70.0},
        {"emotion": "love", "percentage": 30.0},
    ]

    # 3. Three-emotion distribution totaling 100% (Joy 60%, Sadness 25%, Fear 15%)
    r3 = client.post(
        "/api/v1/emotions/reviews",
        json={
            "record_id": rid,
            "action": "correct",
            "human_emotion_distribution": [
                {"emotion": "joy", "percentage": 60},
                {"emotion": "sadness", "percentage": 25},
                {"emotion": "fear", "percentage": 15},
            ],
            "rationale": "Joyful milestone with bittersweet anxiety.",
        },
    )
    assert r3.status_code == 200
    b3 = r3.json()
    assert b3["review"]["review_status"] == "corrected"
    assert b3["review"]["human_emotion_label"] == "joy"
    assert b3["review"]["revision"] == 3
    assert b3["review"]["human_emotion_distribution"] == [
        {"emotion": "joy", "percentage": 60.0},
        {"emotion": "sadness", "percentage": 25.0},
        {"emotion": "fear", "percentage": 15.0},
    ]
    # Original classifier probabilities & top prediction MUST stay completely unchanged
    assert b3["original_emotion"] == orig_emotion
    assert b3["original_sentiment"] == orig_sentiment
    assert b3["umap_coordinates"] == orig_coords
    # Audit history retains every edit
    assert len(b3["history"]) == 3
    assert b3["history"][0]["new_human_distribution"] == [{"emotion": "anger", "percentage": 100.0}]
    assert b3["history"][1]["new_human_distribution"] == [
        {"emotion": "joy", "percentage": 70.0},
        {"emotion": "love", "percentage": 30.0},
    ]
    assert b3["history"][2]["new_human_distribution"] == [
        {"emotion": "joy", "percentage": 60.0},
        {"emotion": "sadness", "percentage": 25.0},
        {"emotion": "fear", "percentage": 15.0},
    ]
    assert b3["history"][2]["previous_human_distribution"] == [
        {"emotion": "joy", "percentage": 70.0},
        {"emotion": "love", "percentage": 30.0},
    ]

    # Persistence after simulated page reload (GET /emotions/reviews/{record_id})
    reloaded = client.get(f"/api/v1/emotions/reviews/{rid}")
    assert reloaded.status_code == 200
    rj = reloaded.json()
    assert rj["review"]["human_emotion_distribution"] == [
        {"emotion": "joy", "percentage": 60.0},
        {"emotion": "sadness", "percentage": 25.0},
        {"emotion": "fear", "percentage": 15.0},
    ]
    assert rj["original_emotion"] == orig_emotion


def test_percentage_validation_rejects_invalid_distributions(client: TestClient) -> None:
    """Reject 90%, 110%, negative, >100, duplicate emotions, and empty distributions without silent normalization."""
    base = _create_sentence_record(client, "Validation probe sentence for percentages.")
    rid = base["record_id"]

    invalid_payloads = [
        # Total = 90%
        {"record_id": rid, "action": "correct", "human_emotion_distribution": [{"emotion": "joy", "percentage": 60}, {"emotion": "sadness", "percentage": 30}]},
        # Total = 110%
        {"record_id": rid, "action": "correct", "human_emotion_distribution": [{"emotion": "joy", "percentage": 60}, {"emotion": "sadness", "percentage": 50}]},
        # Negative value (even when arithmetically summing to 100!)
        {"record_id": rid, "action": "correct", "human_emotion_distribution": [{"emotion": "joy", "percentage": 110}, {"emotion": "sadness", "percentage": -10}]},
        # Negative value with smaller magnitude
        {"record_id": rid, "action": "correct", "human_emotion_distribution": [{"emotion": "joy", "percentage": -5}, {"emotion": "neutral", "percentage": 105}]},
        # Single value above 100%
        {"record_id": rid, "action": "correct", "human_emotion_distribution": [{"emotion": "joy", "percentage": 105}]},
        # Duplicate emotion entries
        {"record_id": rid, "action": "correct", "human_emotion_distribution": [{"emotion": "joy", "percentage": 50}, {"emotion": "joy", "percentage": 50}]},
        # Empty list
        {"record_id": rid, "action": "correct", "human_emotion_distribution": []},
        # Neither distribution nor label
        {"record_id": rid, "action": "correct"},
        # Uncertain inside confirmed percentage distribution
        {"record_id": rid, "action": "correct", "human_emotion_distribution": [{"emotion": "uncertain", "percentage": 100}]},
    ]

    for payload in invalid_payloads:
        bad = client.post("/api/v1/emotions/reviews", json=payload)
        assert bad.status_code == 422, f"Expected 422 for payload {payload}, got {bad.status_code}: {bad.text}"

    # Verify record stayed unreviewed cleanly (zero silent coercion or partial writes)
    check = client.get(f"/api/v1/emotions/reviews/{rid}")
    assert check.status_code == 200
    assert check.json()["review"]["review_status"] == "unreviewed"
    assert check.json()["review"]["human_emotion_distribution"] == []


def test_uncertain_annotation_without_percentages_and_evaluation_exclusion(
    tmp_path: Path,
) -> None:
    """Uncertain annotations require no percentages, are NOT ground truth, and are excluded from evaluation."""
    backend_dir = Path(__file__).resolve().parent.parent
    settings = Settings(
        data_dir=backend_dir / "data",
        artifacts_dir=tmp_path / "artifacts",
        environment="test",
        emotion_reviews_db_path_override=str(tmp_path / "isolated_eval.db"),
    )
    container = ServiceContainer(settings)
    affect_svc = AffectAnalysisService(
        artifacts_dir=tmp_path / "artifacts",
        sentiment_model_name=settings.sentiment_model_name,
        emotion_model_name=settings.emotion_model_name,
        sentiment_backend=FakeSentimentBackend(),
        emotion_backend=FakeEmotionBackend(),
    )
    store = container.emotion_review_store

    # 1. Create unreviewed record (should be excluded)
    s1, e1 = affect_svc.analyze_text("The report was submitted.")
    rid_unrev, _, _ = store.create_or_get_record(
        record_id="rec_unrev",
        input_text="The report was submitted.",
        sentiment=s1,
        emotion=e1,
        coordinates=Coordinate3D(x=0.1, y=0.2, z=0.3),
    )

    # 2. Create flagged_uncertain record WITHOUT percentages (should be excluded)
    s2, e2 = affect_svc.analyze_text("I feel slightly confused today.")
    rid_unc, _, _ = store.create_or_get_record(
        record_id="rec_unc",
        input_text="I feel slightly confused today.",
        sentiment=s2,
        emotion=e2,
        coordinates=Coordinate3D(x=0.4, y=0.5, z=0.6),
    )
    from app.models.emotion_schemas import EmotionCategory, HumanEmotionDistributionItem, ReviewAction

    unc_resp = store.submit_review(
        record_id=rid_unc,
        action=ReviewAction.flag_uncertain,
        rationale="Genuinely ambiguous.",
    )
    assert unc_resp.review.review_status.value == "flagged_uncertain"
    assert unc_resp.review.human_emotion_distribution == []
    assert unc_resp.review.confirmed_for_evaluation is False

    # 3. Create mixed-emotion confirmed record (Joy 60%, Sadness 25%, Fear 15%)
    s3, e3 = affect_svc.analyze_text("I am happy about the launch though nervous and a bit sad.")
    rid_mix, _, _ = store.create_or_get_record(
        record_id="rec_mix",
        input_text="I am happy about the launch though nervous and a bit sad.",
        sentiment=s3,
        emotion=e3,
        coordinates=Coordinate3D(x=0.7, y=0.8, z=0.9),
    )
    store.submit_review(
        record_id=rid_mix,
        action=ReviewAction.correct,
        human_emotion_distribution=[
            HumanEmotionDistributionItem(emotion=EmotionCategory.joy, percentage=60.0),
            HumanEmotionDistributionItem(emotion=EmotionCategory.sadness, percentage=25.0),
            HumanEmotionDistributionItem(emotion=EmotionCategory.fear, percentage=15.0),
        ],
    )

    summary = store.compute_evaluation_summary()
    assert summary.total_records == 3
    assert summary.confirmed_ground_truth_count == 1
    assert summary.excluded_uncertain_count == 1
    assert summary.excluded_unreviewed_count == 1
    assert summary.mixed_distribution_count == 1
    assert len(summary.records) == 1
    assert summary.records[0].record_id == rid_mix
    assert summary.records[0].dominant_human_emotion == EmotionCategory.joy
    assert [
        (d.emotion.value, d.percentage) for d in summary.records[0].human_emotion_distribution
    ] == [("joy", 60.0), ("sadness", 25.0), ("fear", 15.0)]
    assert "never classifier confidence" in summary.limitations


def test_semantic_graph_sync_and_dual_label_modes(client: TestClient) -> None:
    """Verify semantic graph carries complete percentage distributions, filters mixed labels, and keeps coords frozen."""
    full_map = client.get("/api/v1/semantic-map?limit=360").json()
    corp_pt = next(p for p in full_map["points"] if p["id"] == "corp_001")
    orig_model_emo = corp_pt["emotion_label"]
    orig_coords = corp_pt["coordinates"]

    try:
        # Apply Joy 60%, Sadness 25%, Fear 15% onto corp_001
        resp = client.post(
            "/api/v1/emotions/reviews",
            json={
                "record_id": "corp_001",
                "action": "correct",
                "human_emotion_distribution": [
                    {"emotion": "joy", "percentage": 60},
                    {"emotion": "sadness", "percentage": 25},
                    {"emotion": "fear", "percentage": 15},
                ],
                "rationale": "Graph sync mixed test.",
            },
        )
        assert resp.status_code == 200

        # Filtering by secondary emotion (sadness 25%) in default/human mode MUST include corp_001
        sad_map = client.get(
            "/api/v1/semantic-map?limit=360&emotion=sadness&label_mode=human"
        ).json()
        synced = next((p for p in sad_map["points"] if p["id"] == "corp_001"), None)
        assert synced is not None, "corp_001 should appear when filtering by secondary mixed emotion 'sadness'"
        assert synced["human_emotion_label"] == "joy"
        assert synced["human_emotion_distribution"] == [
            {"emotion": "joy", "percentage": 60.0},
            {"emotion": "sadness", "percentage": 25.0},
            {"emotion": "fear", "percentage": 15.0},
        ]
        # Original model prediction and UMAP coords MUST stay frozen
        assert synced["emotion_label"] == orig_model_emo
        assert synced["coordinates"] == orig_coords

        # Filtering with label_mode=model uses ONLY original classifier predictions
        model_map = client.get(
            f"/api/v1/semantic-map?limit=360&emotion={orig_model_emo}&label_mode=model"
        ).json()
        assert any(p["id"] == "corp_001" for p in model_map["points"])
    finally:
        # Cleanly restore corp_001 back to 100% original model label
        client.post(
            "/api/v1/emotions/reviews",
            json={
                "record_id": "corp_001",
                "action": "confirm",
                "human_emotion_distribution": [{"emotion": orig_model_emo, "percentage": 100}],
            },
        )


def test_semantic_graph_sentiment_sync_and_modes(client: TestClient) -> None:
    """Verify human_sentiment_label updates semantic map immediately in human mode while model mode stays immutable."""
    full_map = client.get("/api/v1/semantic-map?limit=360").json()
    corp_pt = next(p for p in full_map["points"] if p["id"] == "corp_001")
    orig_model_emo = corp_pt["emotion_label"]
    orig_model_sent = corp_pt["sentiment_label"]
    orig_coords = corp_pt["coordinates"]

    try:
        resp = client.post(
            "/api/v1/emotions/reviews",
            json={
                "record_id": "corp_001",
                "action": "correct",
                "human_emotion_distribution": [
                    {"emotion": "joy", "percentage": 60},
                    {"emotion": "sadness", "percentage": 25},
                    {"emotion": "fear", "percentage": 15},
                ],
                "human_sentiment_label": "mixed",
                "rationale": "Mixed emotion + mixed sentiment verification.",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["review"]["human_sentiment_label"] == "mixed"
        assert body["original_sentiment"]["predicted_label"] == orig_model_sent

        # Human mode filter by sentiment=mixed returns corp_001 with unchanged model label & coords
        mixed_human_map = client.get(
            "/api/v1/semantic-map?limit=360&sentiment=mixed&label_mode=human"
        ).json()
        synced = next((p for p in mixed_human_map["points"] if p["id"] == "corp_001"), None)
        assert synced is not None
        assert synced["human_sentiment_label"] == "mixed"
        assert synced["sentiment_label"] == orig_model_sent
        assert synced["emotion_label"] == orig_model_emo
        assert synced["coordinates"] == orig_coords

        # Model mode filter by sentiment=mixed does NOT include corp_001 (model sentiment immutable)
        mixed_model_map = client.get(
            "/api/v1/semantic-map?limit=360&sentiment=mixed&label_mode=model"
        ).json()
        assert not any(p["id"] == "corp_001" for p in mixed_model_map["points"])
    finally:
        client.post(
            "/api/v1/emotions/reviews",
            json={
                "record_id": "corp_001",
                "action": "confirm",
                "human_emotion_distribution": [{"emotion": orig_model_emo, "percentage": 100}],
                "human_sentiment_label": orig_model_sent,
            },
        )


def test_historical_single_emotion_db_migration_compatibility(tmp_path: Path) -> None:
    """Legacy single-emotion rows in SQLite resolve as 100% cleanly without losing history."""
    db_file = tmp_path / "legacy_emotion_reviews.db"
    conn = sqlite3.connect(str(db_file))
    # Create pre-enhancement schema WITHOUT human_emotion_distribution_json columns
    conn.execute(
        """
        CREATE TABLE emotion_records (
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
        CREATE TABLE emotion_review_history (
            history_id TEXT PRIMARY KEY,
            record_id TEXT NOT NULL,
            previous_status TEXT NOT NULL,
            new_status TEXT NOT NULL,
            previous_human_emotion TEXT,
            new_human_emotion TEXT NOT NULL,
            action TEXT NOT NULL,
            rationale TEXT,
            reviewed_at TEXT NOT NULL
        );
        """
    )

    sent_pred, emo_pred = AffectAnalysisService(
        artifacts_dir=tmp_path,
        sentiment_model_name="fake/s",
        emotion_model_name="fake/e",
        sentiment_backend=FakeSentimentBackend(),
        emotion_backend=FakeEmotionBackend(),
    ).analyze_text("I adore this engineering architecture.")

    conn.execute(
        """
        INSERT INTO emotion_records (
            record_id, input_text, original_sentiment_json, original_emotion_json,
            original_emotion_label, original_raw_emotion_label, original_confidence,
            coord_x, coord_y, coord_z, created_at,
            review_status, human_emotion_label, rationale, reviewed_at, history_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, 2.0, 3.0, '2026-11-27T12:00:00Z',
                  'corrected', 'fear', 'Legacy single-label correction', '2026-11-27T12:05:00Z', 1)
        """,
        (
            "legacy_rec_1",
            "I adore this engineering architecture.",
            sent_pred.model_dump_json(),
            emo_pred.model_dump_json(),
            emo_pred.predicted_emotion.value,
            emo_pred.raw_top_label,
            emo_pred.confidence,
        ),
    )
    conn.execute(
        """
        INSERT INTO emotion_review_history (
            history_id, record_id, previous_status, new_status,
            previous_human_emotion, new_human_emotion, action, rationale, reviewed_at
        ) VALUES ('h1', 'legacy_rec_1', 'unreviewed', 'corrected', NULL, 'fear', 'correct',
                  'Legacy single-label correction', '2026-11-27T12:05:00Z')
        """
    )
    conn.commit()
    conn.close()

    # Opening EmotionReviewStore migrates columns and interprets legacy correction as 100%
    migrated_store = EmotionReviewStore(db_file)
    fetched = migrated_store.get_review("legacy_rec_1")
    assert fetched.review.review_status.value == "corrected"
    assert fetched.review.human_emotion_label.value == "fear"
    assert [(d.emotion.value, d.percentage) for d in fetched.review.human_emotion_distribution] == [
        ("fear", 100.0)
    ]
    assert fetched.review.confirmed_for_evaluation is True
    assert fetched.history[0].new_human_emotion.value == "fear"
    assert [
        (d.emotion.value, d.percentage) for d in fetched.history[0].new_human_distribution
    ] == [("fear", 100.0)]
