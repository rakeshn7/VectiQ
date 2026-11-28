"""Genuine transformer Sentiment (RoBERTa) & Multi-Emotion (GoEmotions) inference service."""

import ctypes
import gc
import json
import math
from pathlib import Path
import threading
from typing import Any, Optional, Protocol

from app.core.exceptions import EngineNotReadyError, InvalidInputError
from app.core.logging import get_logger
from app.models.emotion_schemas import (
    CorpusAffectSummary,
    EmotionCategory,
    EmotionPrediction,
    EmotionProbabilityItem,
    SentimentLabel,
    SentimentPrediction,
    SentimentProbabilities,
)
from app.services.dataset_service import DatasetService

logger = get_logger(__name__)

_GOEMOTIONS_TO_CANONICAL: dict[str, EmotionCategory] = {
    "joy": EmotionCategory.joy,
    "sadness": EmotionCategory.sadness,
    "anger": EmotionCategory.anger,
    "fear": EmotionCategory.fear,
    "surprise": EmotionCategory.surprise,
    "disgust": EmotionCategory.disgust,
    "love": EmotionCategory.love,
    "neutral": EmotionCategory.neutral,
}

_TAXONOMY_NOTE = (
    "GoEmotions classifies joy and happiness under one unified 'joy' label and does not "
    "distinguish them separately. Fine-grained labels outside the core classes (e.g., "
    "admiration, curiosity, disappointment, approval) are reported under 'other' with the exact "
    "raw classifier label preserved."
)


def map_goemotion_category(raw_label: str) -> EmotionCategory:
    """Map raw GoEmotions label onto canonical categories without inventing unsupported distinctions."""
    return _GOEMOTIONS_TO_CANONICAL.get(raw_label.strip().lower(), EmotionCategory.other)


class SentimentBackendProtocol(Protocol):
    model_name: str

    def predict_batch(self, texts: list[str]) -> list[SentimentProbabilities]:
        """Return 3-class probabilities for each text."""


class EmotionBackendProtocol(Protocol):
    model_name: str

    def predict_batch(self, texts: list[str]) -> list[dict[str, float]]:
        """Return label->probability map for each text."""


def _release_process_memory() -> None:
    """Trigger GC and return freed heap arenas to OS on glibc Linux hosts."""
    gc.collect()
    try:
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass


def _load_sequence_classifier(
    model_name: str, *, low_memory_mode: bool
) -> tuple[Any, Any]:
    """Load tokenizer and sequence classifier, preferring local cache and optional bfloat16."""
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    model_kwargs: dict[str, Any] = {}
    if low_memory_mode:
        import torch

        torch.set_num_threads(1)
        model_kwargs["low_cpu_mem_usage"] = True
        model_kwargs["dtype"] = torch.bfloat16

    try:
        tok = AutoTokenizer.from_pretrained(model_name, local_files_only=True)
        mdl = AutoModelForSequenceClassification.from_pretrained(
            model_name, local_files_only=True, **model_kwargs
        )
        logger.info("Loaded model %s from local cache (low_mem=%s).", model_name, low_memory_mode)
    except Exception:
        logger.info(
            "Local cache miss for model %s; downloading from HuggingFace Hub...",
            model_name,
        )
        tok = AutoTokenizer.from_pretrained(model_name)
        mdl = AutoModelForSequenceClassification.from_pretrained(model_name, **model_kwargs)
    mdl.eval()
    return tok, mdl


class HuggingFaceSentimentBackend:
    """Thread-safe inference wrapper for cardiffnlp/twitter-roberta-base-sentiment-latest."""

    def __init__(self, model_name: str, *, low_memory_mode: bool = False) -> None:
        self.model_name = model_name
        self.low_memory_mode = low_memory_mode
        self._tokenizer: Any = None
        self._model: Any = None
        self._label_idx: dict[str, int] = {}
        self._verified: bool = False
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._tokenizer is not None and self._model is not None

    @property
    def is_verified(self) -> bool:
        return self._verified or self.is_loaded

    def load(self) -> None:
        with self._lock:
            if self.is_loaded:
                return
            tok, mdl = _load_sequence_classifier(
                self.model_name, low_memory_mode=self.low_memory_mode
            )
            id2label = getattr(mdl.config, "id2label", None) or {
                0: "negative",
                1: "neutral",
                2: "positive",
            }
            idx_map = {str(v).strip().lower(): int(k) for k, v in id2label.items()}
            if not {"negative", "neutral", "positive"}.issubset(idx_map):
                raise RuntimeError(f"Unexpected sentiment labels on {self.model_name}: {id2label}")
            self._tokenizer = tok
            self._model = mdl
            self._label_idx = idx_map
            self._verified = True

    def unload(self) -> None:
        with self._lock:
            self._tokenizer = None
            self._model = None
        _release_process_memory()

    def predict_batch(self, texts: list[str], batch_size: int = 32) -> list[SentimentProbabilities]:
        if not self.is_loaded:
            raise EngineNotReadyError(f"Sentiment model '{self.model_name}' is not loaded.")
        if not texts:
            return []
        import torch

        neg_i = self._label_idx["negative"]
        neu_i = self._label_idx["neutral"]
        pos_i = self._label_idx["positive"]
        out: list[SentimentProbabilities] = []
        with self._lock:
            with torch.inference_mode():
                for start in range(0, len(texts), batch_size):
                    chunk = texts[start : start + batch_size]
                    enc = self._tokenizer(
                        chunk,
                        return_tensors="pt",
                        padding=True,
                        truncation=True,
                        max_length=512,
                    )
                    logits = self._model(**enc).logits.float()
                    probs = torch.softmax(logits, dim=-1).cpu()
                    for row in probs:
                        out.append(
                            _normalize_sentiment(
                                float(row[pos_i].item()),
                                float(row[neu_i].item()),
                                float(row[neg_i].item()),
                            )
                        )
        return out


class HuggingFaceEmotionBackend:
    """Thread-safe inference wrapper for SamLowe/roberta-base-go_emotions."""

    def __init__(self, model_name: str, *, low_memory_mode: bool = False) -> None:
        self.model_name = model_name
        self.low_memory_mode = low_memory_mode
        self._tokenizer: Any = None
        self._model: Any = None
        self._id2label: dict[int, str] = {}
        self._verified: bool = False
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._tokenizer is not None and self._model is not None

    @property
    def is_verified(self) -> bool:
        return self._verified or self.is_loaded

    def load(self) -> None:
        with self._lock:
            if self.is_loaded:
                return
            tok, mdl = _load_sequence_classifier(
                self.model_name, low_memory_mode=self.low_memory_mode
            )
            raw_id2label = getattr(mdl.config, "id2label", None) or {}
            if not raw_id2label:
                raise RuntimeError(f"Missing id2label mapping on {self.model_name}.")
            self._tokenizer = tok
            self._model = mdl
            self._id2label = {int(k): str(v).strip().lower() for k, v in raw_id2label.items()}
            self._verified = True

    def unload(self) -> None:
        with self._lock:
            self._tokenizer = None
            self._model = None
        _release_process_memory()

    def predict_batch(self, texts: list[str], batch_size: int = 32) -> list[dict[str, float]]:
        if not self.is_loaded:
            raise EngineNotReadyError(f"Emotion model '{self.model_name}' is not loaded.")
        if not texts:
            return []
        import torch

        out: list[dict[str, float]] = []
        with self._lock:
            with torch.inference_mode():
                for start in range(0, len(texts), batch_size):
                    chunk = texts[start : start + batch_size]
                    enc = self._tokenizer(
                        chunk,
                        return_tensors="pt",
                        padding=True,
                        truncation=True,
                        max_length=512,
                    )
                    logits = self._model(**enc).logits.float()
                    probs = torch.sigmoid(logits).cpu()
                    for row in probs:
                        out.append(
                            {
                                lbl: round(min(1.0, max(0.0, float(row[idx].item()))), 6)
                                for idx, lbl in self._id2label.items()
                            }
                        )
        return out


def _normalize_sentiment(pos: float, neu: float, neg: float) -> SentimentProbabilities:
    vals = [max(0.0, float(v)) if math.isfinite(v) else 0.0 for v in (pos, neu, neg)]
    total = sum(vals)
    if total <= 0.0:
        return SentimentProbabilities(positive=0.0, neutral=1.0, negative=0.0)
    p_pos, p_neu, p_neg = (round(v / total, 6) for v in vals)
    residual = round(1.0 - (p_pos + p_neu + p_neg), 6)
    max_val = max(p_pos, p_neu, p_neg)
    if abs(residual) > 0:
        if p_pos == max_val:
            p_pos = min(1.0, max(0.0, round(p_pos + residual, 6)))
        elif p_neu == max_val:
            p_neu = min(1.0, max(0.0, round(p_neu + residual, 6)))
        else:
            p_neg = min(1.0, max(0.0, round(p_neg + residual, 6)))
    return SentimentProbabilities(positive=p_pos, neutral=p_neu, negative=p_neg)


class AffectAnalysisService:
    """Runs genuine sentiment polarity + multi-emotion inference and caches corpus labels."""

    def __init__(
        self,
        *,
        artifacts_dir: Path,
        sentiment_model_name: str,
        emotion_model_name: str,
        sentiment_prob_threshold: float = 0.60,
        sentiment_margin_threshold: float = 0.15,
        emotion_prob_threshold: float = 0.45,
        low_memory_mode: bool = False,
        sentiment_backend: Optional[SentimentBackendProtocol] = None,
        emotion_backend: Optional[EmotionBackendProtocol] = None,
    ) -> None:
        self.artifacts_dir = artifacts_dir
        self.sentiment_model_name = sentiment_model_name
        self.emotion_model_name = emotion_model_name
        self.sentiment_prob_threshold = sentiment_prob_threshold
        self.sentiment_margin_threshold = sentiment_margin_threshold
        self.emotion_prob_threshold = emotion_prob_threshold
        self.low_memory_mode = low_memory_mode
        self._inference_lock = threading.Lock()

        self.sentiment_backend: Any = sentiment_backend or HuggingFaceSentimentBackend(
            sentiment_model_name, low_memory_mode=low_memory_mode
        )
        self.emotion_backend: Any = emotion_backend or HuggingFaceEmotionBackend(
            emotion_model_name, low_memory_mode=low_memory_mode
        )
        self.corpus_affect: dict[str, CorpusAffectSummary] = {}
        self.is_initialized: bool = False

    @property
    def models_loaded(self) -> bool:
        if self.low_memory_mode:
            s_ready = bool(
                getattr(
                    self.sentiment_backend,
                    "is_verified",
                    getattr(self.sentiment_backend, "is_loaded", True),
                )
            )
            e_ready = bool(
                getattr(
                    self.emotion_backend,
                    "is_verified",
                    getattr(self.emotion_backend, "is_loaded", True),
                )
            )
            return s_ready and e_ready
        s_ready = bool(getattr(self.sentiment_backend, "is_loaded", True))
        e_ready = bool(getattr(self.emotion_backend, "is_loaded", True))
        return s_ready and e_ready

    def initialize(self, dataset_service: DatasetService, *, save_artifacts: bool = True) -> None:
        """Load models and populate cached corpus sentiment & emotion metadata."""
        cache_file = self.artifacts_dir / "corpus_affect_cache_v1.json"
        expected_sig = {
            "dataset_hash": dataset_service.dataset_hash,
            "sentiment_model": getattr(self.sentiment_backend, "model_name", self.sentiment_model_name),
            "emotion_model": getattr(self.emotion_backend, "model_name", self.emotion_model_name),
            "s_prob": self.sentiment_prob_threshold,
            "s_margin": self.sentiment_margin_threshold,
            "e_prob": self.emotion_prob_threshold,
        }

        loaded_cached_records: Optional[dict[str, CorpusAffectSummary]] = None
        if save_artifacts and cache_file.exists():
            try:
                blob = json.loads(cache_file.read_text(encoding="utf-8"))
                if blob.get("signature") == expected_sig:
                    parsed = {
                        k: CorpusAffectSummary.model_validate(v)
                        for k, v in blob.get("records", {}).items()
                    }
                    if len(parsed) == len(dataset_service.records):
                        loaded_cached_records = parsed
            except Exception as exc:
                logger.warning("Recomputing corpus affect cache: %s", exc)

        if self.low_memory_mode:
            if loaded_cached_records is not None:
                if hasattr(self.sentiment_backend, "load"):
                    self.sentiment_backend.load()
                if hasattr(self.sentiment_backend, "unload"):
                    self.sentiment_backend.unload()
                if hasattr(self.emotion_backend, "load"):
                    self.emotion_backend.load()
                if hasattr(self.emotion_backend, "unload"):
                    self.emotion_backend.unload()
                self.corpus_affect = loaded_cached_records
                self.is_initialized = True
                logger.info(
                    "Loaded cached corpus sentiment & emotion labels (%d, low_memory_mode=True).",
                    len(loaded_cached_records),
                )
                return

            texts = [r.text for r in dataset_service.records]
            s_preds, e_preds = self.analyze_batch(texts)
        else:
            if hasattr(self.sentiment_backend, "load"):
                self.sentiment_backend.load()
            if hasattr(self.emotion_backend, "load"):
                self.emotion_backend.load()

            if loaded_cached_records is not None:
                self.corpus_affect = loaded_cached_records
                self.is_initialized = True
                logger.info(
                    "Loaded cached corpus sentiment & emotion labels (%d).",
                    len(loaded_cached_records),
                )
                return

            texts = [r.text for r in dataset_service.records]
            s_preds, e_preds = self.analyze_batch(texts)
        self.corpus_affect = {
            rec.id: CorpusAffectSummary(
                sentiment_label=s_preds[idx].predicted_label,
                sentiment_confidence=s_preds[idx].confidence,
                sentiment_is_uncertain=s_preds[idx].is_uncertain,
                emotion_label=e_preds[idx].predicted_emotion,
                emotion_raw_label=e_preds[idx].raw_top_label,
                emotion_confidence=e_preds[idx].confidence,
                emotion_is_uncertain=e_preds[idx].is_uncertain,
            )
            for idx, rec in enumerate(dataset_service.records)
        }

        if save_artifacts:
            self.artifacts_dir.mkdir(parents=True, exist_ok=True)
            cache_tmp = self.artifacts_dir / "corpus_affect_cache_v1.json.tmp"
            cache_tmp.write_text(
                json.dumps(
                    {
                        "signature": expected_sig,
                        "records": {k: v.model_dump(mode="json") for k, v in self.corpus_affect.items()},
                    }
                ),
                encoding="utf-8",
            )
            cache_tmp.replace(cache_file)
        self.is_initialized = True
        logger.info("Initialized corpus sentiment & emotion metadata for %d sentences.", len(self.corpus_affect))

    def _build_sentiment_prediction(self, probs: SentimentProbabilities) -> SentimentPrediction:
        pairs = [
            (SentimentLabel.positive, probs.positive),
            (SentimentLabel.neutral, probs.neutral),
            (SentimentLabel.negative, probs.negative),
        ]
        pairs.sort(key=lambda item: item[1], reverse=True)
        top_lbl, top_p = pairs[0]
        second_p = pairs[1][1]
        margin = round(max(0.0, top_p - second_p), 6)
        reasons: list[str] = []
        if top_p < self.sentiment_prob_threshold:
            reasons.append(f"max probability {top_p:.3f} < {self.sentiment_prob_threshold:.2f}")
        if margin < self.sentiment_margin_threshold:
            reasons.append(f"margin {margin:.3f} < {self.sentiment_margin_threshold:.2f}")
        is_uncertain = bool(reasons)
        return SentimentPrediction(
            predicted_label=top_lbl,
            effective_label="uncertain" if is_uncertain else top_lbl.value,
            probabilities=probs,
            confidence=round(top_p, 6),
            margin=margin,
            is_uncertain=is_uncertain,
            uncertainty_reason="; ".join(reasons) if reasons else None,
            model_name=getattr(self.sentiment_backend, "model_name", self.sentiment_model_name),
        )

    def _build_emotion_prediction(self, raw_scores: dict[str, float]) -> EmotionPrediction:
        ranked = sorted(raw_scores.items(), key=lambda item: (-item[1], item[0]))
        if not ranked:
            raise RuntimeError("Emotion model returned empty scores.")
        top_lbl, top_p = ranked[0]
        second_p = ranked[1][1] if len(ranked) > 1 else 0.0
        margin = round(max(0.0, top_p - second_p), 6)
        raw_cat = map_goemotion_category(top_lbl)

        reasons: list[str] = []
        if top_p < self.emotion_prob_threshold:
            reasons.append(f"top probability {top_p:.3f} < {self.emotion_prob_threshold:.2f}")
        elif top_p < 0.65 and margin < 0.10:
            reasons.append(f"ambiguous margin {margin:.3f} < 0.10 at moderate confidence")

        is_uncertain = bool(reasons)
        pred_cat = EmotionCategory.uncertain if is_uncertain else raw_cat

        prob_items = [
            EmotionProbabilityItem(
                label=lbl,
                category=map_goemotion_category(lbl),
                probability=round(float(val), 6),
            )
            for lbl, val in ranked
        ]

        return EmotionPrediction(
            predicted_emotion=pred_cat,
            raw_top_label=top_lbl,
            raw_top_category=raw_cat,
            confidence=round(float(top_p), 6),
            margin=margin,
            is_uncertain=is_uncertain,
            uncertainty_reason="; ".join(reasons) if reasons else None,
            probabilities=prob_items,
            taxonomy_note=_TAXONOMY_NOTE,
            model_name=getattr(self.emotion_backend, "model_name", self.emotion_model_name),
        )

    def analyze_text(self, text: str) -> tuple[SentimentPrediction, EmotionPrediction]:
        """Run genuine sentiment & emotion classification for a single text."""
        cleaned = text.strip()
        if not cleaned:
            raise InvalidInputError(
                "Input text must contain non-whitespace characters.",
                details=[{"field": "text", "issue": "Blank string is not allowed."}],
            )
        s_list, e_list = self.analyze_batch([cleaned])
        return s_list[0], e_list[0]

    def analyze_batch(
        self, texts: list[str]
    ) -> tuple[list[SentimentPrediction], list[EmotionPrediction]]:
        """Run genuine batched sentiment and emotion inference."""
        if not texts:
            return [], []
        if self.low_memory_mode:
            with self._inference_lock:
                if hasattr(self.sentiment_backend, "load"):
                    self.sentiment_backend.load()
                raw_sent = self.sentiment_backend.predict_batch(texts)
                if hasattr(self.sentiment_backend, "unload"):
                    self.sentiment_backend.unload()

                if hasattr(self.emotion_backend, "load"):
                    self.emotion_backend.load()
                raw_emo = self.emotion_backend.predict_batch(texts)
                if hasattr(self.emotion_backend, "unload"):
                    self.emotion_backend.unload()
        else:
            raw_sent = self.sentiment_backend.predict_batch(texts)
            raw_emo = self.emotion_backend.predict_batch(texts)
        return (
            [self._build_sentiment_prediction(s) for s in raw_sent],
            [self._build_emotion_prediction(e) for e in raw_emo],
        )
