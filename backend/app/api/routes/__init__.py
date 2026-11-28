"""Versioned API v1 router registry."""

from fastapi import APIRouter

from app.api.routes.config import router as config_router
from app.api.routes.emotions import router as emotions_router
from app.api.routes.evaluate import router as evaluate_router
from app.api.routes.health import router as health_router
from app.api.routes.semantic_map import router as semantic_map_router
from app.api.routes.steer import router as steer_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(config_router)
api_router.include_router(semantic_map_router)
api_router.include_router(steer_router)
api_router.include_router(evaluate_router)
api_router.include_router(emotions_router)

