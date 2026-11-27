"""FastAPI application entry point for Semantic Space Studio API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.core.config import get_settings
from app.models.schemas import RootResponse


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "Backend API for Semantic Space Studio – Embedding Model with "
            "Vector Steering and Semantic Space Visualizer."
        ),
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get(
        "/",
        response_model=RootResponse,
        tags=["Root"],
        summary="API Root",
    )
    def read_root() -> RootResponse:
        """Return basic service information."""
        return RootResponse(
            message="Semantic Space Studio API is running.",
            service=settings.app_name,
            version=settings.app_version,
            docs_url="/docs",
        )

    application.include_router(health_router, prefix="/api/v1")

    return application


app = create_app()

