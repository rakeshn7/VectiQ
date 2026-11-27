"""Compatibility re-export for the health-check route."""

from app.api.routes.health import router

__all__ = ["router"]
