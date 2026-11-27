# Semantic Space Studio – Backend

FastAPI backend for **Semantic Space Studio – Embedding Model with Vector Steering and Semantic Space Visualizer**.

> **Status:** Initialization phase complete. Only the core FastAPI foundation, configuration, and health-check endpoint are currently implemented.

## Project Structure

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── api/
│   │   ├── __init__.py
│   │   └── health.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   ├── services/
│   │   └── __init__.py
│   └── core/
│       ├── __init__.py
│       └── config.py
├── data/
├── artifacts/
├── tests/
│   ├── __init__.py
│   └── test_api.py
├── .env.example
├── .gitignore
├── pytest.ini
├── requirements.txt
└── README.md
```

## Local Setup

Create and activate a virtual environment inside `backend/`:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Optionally copy `.env.example` to `.env` to customize settings:

```powershell
copy .env.example .env
```

## Run the Server

```powershell
uvicorn app.main:app --reload --port 8000
```

Available endpoints (initialization phase):

- `GET http://localhost:8000/` – API root metadata
- `GET http://localhost:8000/api/v1/health` – Health check
- `GET http://localhost:8000/docs` – Interactive Swagger UI

## Run Tests

```powershell
pytest
```

