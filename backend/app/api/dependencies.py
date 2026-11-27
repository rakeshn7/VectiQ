"""FastAPI dependency helpers for accessing initialized backend services."""

from fastapi import Request

from app.core.exceptions import EngineNotReadyError
from app.services.container import ServiceContainer


def get_container(request: Request) -> ServiceContainer:
    """Return the ServiceContainer attached to app state."""
    container = getattr(request.app.state, "container", None)
    if container is None:
        raise EngineNotReadyError("Service container is not initialized.")
    return container


def get_ready_container(request: Request) -> ServiceContainer:
    """Return the ServiceContainer after verifying all ML services are ready."""
    container = get_container(request)
    container.ensure_ready()
    return container

