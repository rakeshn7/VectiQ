"""Unit, API, immutability, and real HuggingFace integration tests for Emotion Analysis & Review."""

from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from app.core.config import Settings
from app.services.container import ServiceContainer


def test_emotion_analyze_and_human_correction_immutability(client: TestClient) -> None:
    """Verify analyze returns sentiment + separated emotion + neighbors, and human edits preserve original outputs."""
    sad = client.post(
        "/api/v1/emotions/analyze",
        json={"text": "I am sad", "concept": "positive_sentiment", "top_k_neighbors": 5},
    )
    assert sad.status_code == 200
    body = sad.json()
    rid = body["record_id"]
    orig_coords = body["embedding_info"]["umap_coordinates"]
    assert body["input_text"] == "I am sad"
    assert body["sentiment"]["predicted_label"] == "negative"
    assert body["emotion"]["predicted_emotion"] == "sadness"
    assert body["emotion"]["raw_top_label"] == "sadness"
    assert "joy and happiness" in body["emotion"]["taxonomy_note"]
    assert body["embedding_info"]["dimensions"] == 384
    assert len(body["nearest_neighbors"]) == 5
    assert all(nn["emotion_label"] is not None for nn in body["nearest_neighbors"])
    assert body["review"]["review_status"] == "unreviewed"

    # Confirm predicted emotion
    conf = client.post(
        "/api/v1/emotions/reviews",
        json={"record_id": rid, "action": "confirm", "human_emotion_label": "sadness"},
    )
    assert conf.status_code == 200
    conf_json = conf.json()
    assert conf_json["review"]["review_status"] == "confirmed"
    assert conf_json["review"]["human_emotion_label"] == "sadness"
    assert conf_json["original_emotion"]["predicted_emotion"] == "sadness"
    assert conf_json["umap_coordinates"] == orig_coords

    # Correct to anger: original prediction & UMAP coordinates MUST stay unchanged!
    corr = client.post(
        "/api/v1/emotions/reviews",
        json={
            "record_id": rid,
            "action": "correct",
            "human_emotion_label": "anger",
            "rationale": "Tone reflects frustration more than sadness.",
        },
    )
    assert corr.status_code == 200
    corr_json = corr.json()
    assert corr_json["review"]["review_status"] == "corrected"
    assert corr_json["review"]["human_emotion_label"] == "anger"
    assert corr_json["original_emotion"]["predicted_emotion"] == "sadness"
    assert corr_json["umap_coordinates"] == orig_coords
    assert len(corr_json["history"]) == 2


def test_ambiguous_uncertainty_and_semantic_map_filters(client: TestClient) -> None:
    """Verify uncertain predictions and /semantic-map emotion/sentiment filters without altering UMAP coords."""
    ambig = client.post(
        "/api/v1/emotions/analyze",
        json={"text": "ambiguous borderline comment without strong cues"},
    )
    assert ambig.status_code == 200
    aj = ambig.json()
    assert aj["sentiment"]["is_uncertain"] is True
    assert aj["emotion"]["is_uncertain"] is True
    assert aj["emotion"]["predicted_emotion"] == "uncertain"

    # Fetch baseline map coordinates vs filtered map coordinates
    full_map = client.get("/api/v1/semantic-map?limit=360").json()
    joy_map = client.get("/api/v1/semantic-map?limit=360&emotion=joy").json()
    assert joy_map["total_points"] > 0
    assert all(p["emotion_label"] == "joy" for p in joy_map["points"])

    pos_map = client.get("/api/v1/semantic-map?limit=360&sentiment=positive").json()
    assert pos_map["total_points"] > 0
    assert all(p["sentiment_label"] == "positive" for p in pos_map["points"])

    # Human correction on corp_001 moves it under corrected emotion filter without shifting coords
    corp_001 = next(p for p in full_map["points"] if p["id"] == "corp_001")
    new_emo = "surprise" if corp_001["emotion_label"] != "surprise" else "anger"
    client.post(
        "/api/v1/emotions/reviews",
        json={"record_id": "corp_001", "action": "correct", "human_emotion_label": new_emo},
    )
    filt = client.get(f"/api/v1/semantic-map?limit=360&emotion={new_emo}").json()
    updated = next(p for p in filt["points"] if p["id"] == "corp_001")
    assert updated["human_emotion_label"] == new_emo
    assert updated["emotion_review_status"] == "corrected"
    assert updated["coordinates"] == corp_001["coordinates"]


def test_real_models_part6_sentences(tmp_path: Path) -> None:
    """Validate Part 6 test sentences end-to-end against real cached MiniLM, UMAP, RoBERTa & GoEmotions."""
    backend_dir = Path(__file__).resolve().parent.parent
    real_settings = Settings(
        data_dir=backend_dir / "data",
        artifacts_dir=backend_dir / "artifacts",
        environment="test",
        emotion_reviews_db_path_override=str(tmp_path / "real_emotion_reviews.db"),
    )
    container = ServiceContainer(real_settings)
    container.initialize(save_artifacts=True)

    s_sad, e_sad = container.affect_analysis_service.analyze_text("I am sad")
    assert s_sad.predicted_label.value == "negative"
    assert e_sad.predicted_emotion.value == "sadness"
    assert e_sad.confidence >= 0.80

    s_happy, e_happy = container.affect_analysis_service.analyze_text("I am very happy today")
    assert s_happy.predicted_label.value == "positive"
    assert e_happy.predicted_emotion.value == "joy"
    assert e_happy.confidence >= 0.80

    s_neu, e_neu = container.affect_analysis_service.analyze_text(
        "The quarterly technical report was archived on Tuesday."
    )
    assert s_neu.predicted_label.value == "neutral"
    assert e_neu.predicted_emotion.value == "neutral"

    # Verify real HF GoEmotions returns all 28 classifier-supported labels with real probabilities
    assert len(e_happy.probabilities) == 28
    supported_labels = {item.label for item in e_happy.probabilities}
    assert {"love", "joy", "sadness", "anger", "fear", "surprise", "disgust", "neutral"}.issubset(
        supported_labels
    )
    assert "happiness" not in supported_labels
    assert abs(sum(vars(s_happy.probabilities).values()) - 1.0) < 1e-4


def test_semantic_map_combined_search_category_emotion_sentiment(client: TestClient) -> None:
    """Verify combined search + category + emotion + sentiment filtering on GET /api/v1/semantic-map."""
    full_map = client.get("/api/v1/semantic-map?limit=360").json()
    target = full_map["points"][0]
    target_emotion = target["human_emotion_label"] or target["emotion_label"]
    target_sentiment = (
        "uncertain" if target["sentiment_is_uncertain"] else target["sentiment_label"]
    )
    token = next(w for w in target["text"].split() if len(w.strip(".,!?:;")) >= 4).strip(".,!?:;")

    # Case-insensitive search + category + emotion + sentiment combined
    res_combined = client.get(
        "/api/v1/semantic-map",
        params={
            "limit": 360,
            "search": token.upper(),
            "category": target["category"],
            "emotion": target_emotion,
            "sentiment": target_sentiment,
        },
    )
    assert res_combined.status_code == 200
    combined = res_combined.json()
    assert combined["total_points"] >= 1
    assert any(pt["id"] == target["id"] for pt in combined["points"])
    for pt in combined["points"]:
        eff_emo = pt["human_emotion_label"] or pt["emotion_label"] or ""
        eff_sent = "uncertain" if pt["sentiment_is_uncertain"] else pt["sentiment_label"]
        assert pt["category"] == target["category"]
        assert eff_emo == target_emotion
        assert eff_sent == target_sentiment
        assert (
            token.lower() in pt["text"].lower()
            or token.lower() in pt["id"].lower()
            or token.lower() in pt["category"].lower()
            or token.lower() in eff_emo.lower()
        )

    # Search by point ID
    by_id = client.get("/api/v1/semantic-map", params={"limit": 360, "search": target["id"]})
    assert by_id.status_code == 200
    assert any(pt["id"] == target["id"] for pt in by_id.json()["points"])

    # Whitespace-only search does not exclude points
    ws = client.get("/api/v1/semantic-map", params={"limit": 360, "search": "   "})
    assert ws.status_code == 200
    assert ws.json()["total_points"] == full_map["total_points"]

    # Non-matching search returns clean empty result
    empty = client.get(
        "/api/v1/semantic-map",
        params={"limit": 360, "search": "__unlikely_nonexistent_token_999__"},
    )
    assert empty.status_code == 200
    assert empty.json()["total_points"] == 0
    assert empty.json()["points"] == []


def test_vector_steering_affect_independence_and_10_scenarios(client: TestClient) -> None:
    """Validate all 10 integration scenarios for Vector Steering + Sentiment/Emotion Analysis."""
    # 1. Positive input
    pos_affect = client.post(
        "/api/v1/emotions/analyze",
        json={"text": "I am delighted and very happy with the results.", "concept": "positive_sentiment"},
    )
    assert pos_affect.status_code == 200
    pos_json = pos_affect.json()
    assert pos_json["sentiment"]["predicted_label"] == "positive"
    assert pos_json["emotion"]["predicted_emotion"] == "joy"
    assert pos_json["emotion"]["is_uncertain"] is False
    prob_labels = {item["label"] for item in pos_json["emotion"]["probabilities"]}
    assert {"love", "joy", "sadness", "anger", "fear", "surprise", "disgust", "neutral"}.issubset(
        prob_labels
    )

    # 2. Negative input
    neg_affect = client.post(
        "/api/v1/emotions/analyze",
        json={"text": "I am sad and miserable about this broken deployment.", "concept": "positive_sentiment"},
    )
    assert neg_affect.status_code == 200
    assert neg_affect.json()["sentiment"]["predicted_label"] == "negative"
    assert neg_affect.json()["emotion"]["predicted_emotion"] == "sadness"

    # 3. Neutral input
    neu_affect = client.post(
        "/api/v1/emotions/analyze",
        json={"text": "The quarterly deployment schedule was archived on Tuesday.", "concept": "formal_tone"},
    )
    assert neu_affect.status_code == 200
    assert neu_affect.json()["sentiment"]["predicted_label"] == "neutral"
    assert neu_affect.json()["emotion"]["predicted_emotion"] == "neutral"

    # 4. Ambiguous input -> flagged uncertain
    ambig_affect = client.post(
        "/api/v1/emotions/analyze",
        json={"text": "ambiguous borderline comment with uncertain tone", "concept": "positive_sentiment"},
    )
    assert ambig_affect.status_code == 200
    ambig_json = ambig_affect.json()
    assert ambig_json["sentiment"]["is_uncertain"] is True
    assert ambig_json["emotion"]["is_uncertain"] is True
    assert ambig_json["emotion"]["predicted_emotion"] == "uncertain"

    # 5. Empty / whitespace input rejected cleanly on both endpoints
    for endpoint in ("/api/v1/steer", "/api/v1/emotions/analyze"):
        empty_res = client.post(endpoint, json={"text": "   ", "concept": "positive_sentiment"})
        assert empty_res.status_code == 422

    # 6. Classifier unavailable (503) must NOT prevent vector steering from succeeding (200)
    container = client.app.state.container
    was_initialized = container.affect_analysis_service.is_initialized
    container.affect_analysis_service.is_initialized = False
    try:
        unavailable = client.post(
            "/api/v1/emotions/analyze",
            json={"text": "I love this clean architecture.", "concept": "technical_tone"},
        )
        assert unavailable.status_code == 503
        steer_still_ok = client.post(
            "/api/v1/steer",
            json={
                "text": "I love this clean architecture.",
                "concept": "technical_tone",
                "strength": 0.5,
            },
        )
        assert steer_still_ok.status_code == 200
    finally:
        container.affect_analysis_service.is_initialized = was_initialized

    # 7 & 8. Human confirmation and correction preserve original model predictions & UMAP coords
    rid = pos_json["record_id"]
    orig_coords = pos_json["embedding_info"]["umap_coordinates"]
    conf = client.post(
        "/api/v1/emotions/reviews",
        json={"record_id": rid, "action": "confirm", "human_emotion_label": "joy"},
    )
    assert conf.status_code == 200
    assert conf.json()["review"]["review_status"] == "confirmed"
    assert conf.json()["original_emotion"]["predicted_emotion"] == "joy"

    corr = client.post(
        "/api/v1/emotions/reviews",
        json={
            "record_id": rid,
            "action": "correct",
            "human_emotion_label": "love",
            "rationale": "Strong appreciation.",
        },
    )
    assert corr.status_code == 200
    corr_json = corr.json()
    assert corr_json["review"]["review_status"] == "corrected"
    assert corr_json["review"]["human_emotion_label"] == "love"
    assert corr_json["original_emotion"]["predicted_emotion"] == "joy"
    assert corr_json["umap_coordinates"] == orig_coords

    # 9 & 10. Zero, positive, and negative steering strengths operate cleanly & affect stays invariant across concepts
    base_sentence = "The code runs fast and without any problems."
    s0 = client.post(
        "/api/v1/steer",
        json={"text": base_sentence, "concept": "technical_tone", "strength": 0.0},
    ).json()
    s_pos = client.post(
        "/api/v1/steer",
        json={"text": base_sentence, "concept": "technical_tone", "strength": 0.75},
    ).json()
    s_neg = client.post(
        "/api/v1/steer",
        json={"text": base_sentence, "concept": "technical_tone", "strength": -0.75},
    ).json()
    assert s0["concept_metrics"]["delta"] == 0.0
    assert s_pos["concept_metrics"]["delta"] > 0.0
    assert s_neg["concept_metrics"]["delta"] < 0.0

    a_tech = client.post(
        "/api/v1/emotions/analyze",
        json={"text": base_sentence, "concept": "technical_tone"},
    ).json()
    a_formal = client.post(
        "/api/v1/emotions/analyze",
        json={"text": base_sentence, "concept": "formal_tone"},
    ).json()
    assert a_tech["sentiment"] == a_formal["sentiment"]
    assert a_tech["emotion"] == a_formal["emotion"]


