# Semantic Space Studio – Backend

FastAPI backend and local AI/ML engine for **VectiQ – Semantic Space Studio: Embedding Model with Vector Steering and Semantic Space Visualizer**.

## Architecture & Services

The backend implements the canonical specification in [../contracts/api-contract.md](../contracts/api-contract.md):

- **`DatasetService`** ([app/services/dataset_service.py](app/services/dataset_service.py)) – Loads and validates the 360-sentence synthetic reference corpus ([data/corpus.csv](data/corpus.csv)) and contrastive concept anchor poles.
- **`EmbeddingService`** ([app/services/embedding_service.py](app/services/embedding_service.py)) – Loads `sentence-transformers/all-MiniLM-L6-v2` once at startup and produces L2-normalized 384-dimensional `float32` embeddings.
- **`SteeringService`** ([app/services/steering_service.py](app/services/steering_service.py)) – Extracts contrastive concept directions $D = \text{normalize}(P - N)$ and executes normalized steering $E' = \text{normalize}(E + \alpha \cdot D)$ for `positive_sentiment`, `technical_tone`, and `formal_tone`.
- **`SemanticMapService`** ([app/services/semantic_map_service.py](app/services/semantic_map_service.py)) – Fits a deterministic 3D UMAP projection once on corpus embeddings, persists/reuses artifacts in `artifacts/`, computes `sklearn.manifold.trustworthiness`, and transforms query/steered embeddings consistently via `umap.transform`.
- **`SimilarityService`** ([app/services/similarity_service.py](app/services/similarity_service.py)) – Performs vectorized 384D cosine nearest-neighbor retrieval.
- **`EvaluationService`** ([app/services/evaluation_service.py](app/services/evaluation_service.py)) – Sweeps steering strengths to compute concept control, semantic preservation, Jaccard neighbor stability, Spearman/Pearson monotonicity, $R^2$ linearity, and UMAP trustworthiness.

## Directory Layout

```text
backend/
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── dependencies.py
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py
│   │       ├── config.py
│   │       ├── semantic_map.py
│   │       ├── steer.py
│   │       └── evaluate.py
│   ├── core/
│   │   ├── config.py
│   │   ├── exceptions.py
│   │   └── logging.py
│   ├── models/
│   │   └── schemas.py
│   └── services/
│       ├── container.py
│       ├── dataset_service.py
│       ├── embedding_service.py
│       ├── steering_service.py
│       ├── semantic_map_service.py
│       ├── similarity_service.py
│       └── evaluation_service.py
├── data/
│   ├── corpus.csv
│   └── README.md
├── artifacts/
├── tests/
│   ├── conftest.py
│   ├── test_api.py
│   ├── test_services.py
│   └── test_integration.py
├── .env.example
├── .gitignore
├── pytest.ini
├── requirements.txt
└── README.md
```

## Windows PowerShell Setup & Run Commands

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Optional environment file:

```powershell
copy .env.example .env
```

Start the FastAPI backend:

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **First Startup Behavior:** On the very first startup (when `sentence-transformers/all-MiniLM-L6-v2` is not yet cached locally and `artifacts/` is empty), the backend downloads the model (~90 MB), encodes the 360 reference sentences, fits the 3D UMAP model, warms up Numba JIT transform, and caches the artifacts inside `backend/artifacts/`. Subsequent startups load cached artifacts in seconds.

### Endpoints

- `GET http://localhost:8000/` – Root service info
- `GET http://localhost:8000/docs` – Interactive Swagger UI
- `GET http://localhost:8000/api/v1/health` – Service, model, and UMAP readiness
- `GET http://localhost:8000/api/v1/config` – Model, steering, and projection configuration
- `GET http://localhost:8000/api/v1/semantic-map` – Reference semantic space coordinates & clusters
- `POST http://localhost:8000/api/v1/steer` – Contrastive vector steering & 3D trajectory
- `POST http://localhost:8000/api/v1/evaluate` – Multi-strength steering evaluation suite

## Running Tests

Run fast unit & API tests (uses deterministic mock model with real math & real UMAP):

```powershell
pytest -m "not integration"
```

Run the full test suite including real `all-MiniLM-L6-v2` model integration tests:

```powershell
pytest
```
