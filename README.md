# VectiQ — Semantic Space Studio

**VectiQ** is an interactive semantic embedding explorer, contrastive vector steering workbench, and UMAP visualization studio built for **Problem 5: Embedding Model with Vector Steering and Semantic Space Visualizer**.

> **Note on Model Provenance:** VectiQ uses the pretrained `sentence-transformers/all-MiniLM-L6-v2` encoder (`384` dimensions, `max_seq_length=256`, L2-normalized) and constructs interpretable contrastive steering directions post-hoc over a curated 360-sentence synthetic reference corpus (`backend/data/corpus.csv`). It does **not** train or fine-tune transformer weights from scratch.

---

## Architecture Overview

- **Backend (`backend/`):** Python + FastAPI service executing all ML inference, 384D contrastive vector steering (`E' = normalize(E + α · D)`), exact 384D cosine nearest-neighbor retrieval, fitted 3D UMAP transformation, and multi-strength evaluation sweeps.
- **Frontend (`frontend/`):** React + TypeScript + Vite + Tailwind CSS + Plotly.js web application with a landing page (`/`) and five interactive workspace views (`/overview`, `/explorer`, `/steering`, `/comparison`, `/evaluation`).
- **Integration Contract (`contracts/api-contract.md`):** Shared schema specification across `GET /api/v1/health`, `GET /api/v1/config`, `GET /api/v1/semantic-map`, `POST /api/v1/steer`, and `POST /api/v1/evaluate`.

---

## Local Setup & Running

### 1. Backend (Port `8000`)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend (Port `5173`)

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/`. See [frontend/README.md](frontend/README.md) and [backend/README.md](backend/README.md) for Railway deployment and environment details.

---

## Automated Tests & Production Build

```powershell
# Backend unit, API, and real-model integration tests (19 tests)
cd backend
.\venv\Scripts\python.exe -m pytest -v

# Frontend TypeScript check & production build
cd ../frontend
npx tsc --noEmit
npm run build
```

---

## Reproducible Scientific Evaluation & Baseline Comparison

Run the standalone evaluation suite from the repository root using the backend virtual environment:

```powershell
.\backend\venv\Scripts\python.exe scripts\run_scientific_evaluation.py
```

This evaluates:
1. **Goal 1 — Steering Controllability (`N = 24` held-out + 5-fold CV):** Target concept delta (`Δ` with 95% CI) vs. `α = 0.0` (neutral control) and a random 384D unit-vector control, displacement directional alignment `cos(E' - E, ±D)`, monotonicity (`Spearman ρ`), linearity (`R²`), repeatability (`0.0` diff), and a `3 × 3` attribute specificity matrix.
2. **Goal 2 — Embedding Preservation:** Zero-strength identity (`< 1e-7` L2), unit-norm validation, cosine preservation & Euclidean/angular drift across strengths, 384D `k`-NN neighborhood preservation (`k = 5, 15`), and `D`-orthogonal subspace alignment.
3. **Goal 3 — Visualization Fidelity (3D vs. 2D `(x, y)` UI Slice vs. 2D UMAP Control):** Local `Trustworthiness`, `Continuity`, top-K `Recall`/`Jaccard` overlap (`k ∈ {5, 10, 15, 30}`), Kruskal Stress-1, global pairwise distance correlation (`Spearman` / `Pearson`), query-time neighbor overlap, and `transform_batch` invariance checks.
4. **Edge Cases & Validation Probes:** Short inputs, `>256`-token truncation, exact-text exclusion sensitivity, NaN vector/input guards, and out-of-distribution prose checks.

### Key Methodological Boundaries

- **Embedding Steering vs. Text Generation:** VectiQ steers 384D representations and surfaces nearest corpus neighbors as semantic proxies; it does **not** decode steered vectors back into newly generated English text.
- **2D / 3D UMAP vs. 384D Space:** The 3D UMAP layout preserves local neighborhoods well (`trustworthiness = 0.9386`, `continuity = 0.9229` at `k = 15`), whereas the frontend's 2D `(x, y)` slice drops to `0.8931` / `0.9072` and global pairwise distances correlate only moderately (`Spearman ρ ≈ 0.43` in 3D, `0.38` in 2D). All vector steering, similarity, and neighbor calculations occur strictly in 384D space.
- **Metric Scope:** `Spearman ρ` and `R²` verify monotonic algebraic progression along `D` even for out-of-distribution text; they must be read alongside target `Δ` vs. random controls, `semantic_preservation_score`, and nearest-neighbor shifts.
