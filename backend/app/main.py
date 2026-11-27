"""FastAPI application entry point for Semantic Space Studio API."""

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import api_router
from app.core.config import Settings, get_settings
from app.core.exceptions import VectiQError, build_error_payload
from app.core.logging import configure_logging, get_logger
from app.models.schemas import RootResponse
from app.services.container import ServiceContainer

logger = get_logger(__name__)


def _register_exception_handlers(application: FastAPI) -> None:
    """Register unified ErrorResponse exception handlers matching contracts/api-contract.md."""

    @application.exception_handler(VectiQError)
    async def vectiq_error_handler(
        request: Request, exc: VectiQError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_payload(
                code=exc.code,
                message=exc.message,
                status_code=exc.status_code,
                details=exc.details,
            ),
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = []
        is_json_decode_error = False
        for err in exc.errors():
            err_type = err.get("type", "")
            if err_type == "json_invalid":
                is_json_decode_error = True
            loc = [str(part) for part in err.get("loc", ()) if part != "body"]
            details.append(
                {
                    "field": ".".join(loc) if loc else None,
                    "issue": err.get("msg", "Invalid input."),
                    "value": err.get("input"),
                }
            )

        status_code = 400 if is_json_decode_error else 422
        code = "BAD_REQUEST" if is_json_decode_error else "VALIDATION_ERROR"
        message = (
            "Malformed JSON request payload."
            if is_json_decode_error
            else "Input validation failed on one or more request fields."
        )
        return JSONResponse(
            status_code=status_code,
            content=build_error_payload(
                code=code,
                message=message,
                status_code=status_code,
                details=details,
            ),
        )

    @application.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        code_map = {
            400: "BAD_REQUEST",
            404: "NOT_FOUND",
            405: "METHOD_NOT_ALLOWED",
            422: "VALIDATION_ERROR",
            503: "SERVICE_UNAVAILABLE",
        }
        code = code_map.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content=build_error_payload(
                code=code,
                message=str(exc.detail),
                status_code=exc.status_code,
            ),
        )

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled server exception on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=build_error_payload(
                code="INTERNAL_SERVER_ERROR",
                message="An unexpected internal error occurred.",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            ),
        )


def create_app(
    *,
    settings: Optional[Settings] = None,
    container: Optional[ServiceContainer] = None,
    initialize_on_startup: bool = True,
) -> FastAPI:
    """Create and configure the FastAPI application instance."""
    active_settings = settings or get_settings()
    configure_logging(active_settings.log_level)

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        if getattr(application.state, "container", None) is None:
            svc_container = ServiceContainer(active_settings)
            application.state.container = svc_container
            if initialize_on_startup:
                try:
                    svc_container.initialize()
                except Exception:
                    logger.error(
                        "Application started in degraded state; ML initialization failed."
                    )
        yield

    application = FastAPI(
        title=active_settings.app_name,
        version=active_settings.app_version,
        description=(
            "Backend API for Semantic Space Studio – Embedding Model with "
            "Vector Steering and Semantic Space Visualizer."
        ),
        lifespan=lifespan,
    )

    if container is not None:
        application.state.container = container

    application.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _register_exception_handlers(application)

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
            service=active_settings.app_name,
            version=active_settings.app_version,
            docs_url="/docs",
        )

    application.include_router(api_router, prefix="/api/v1")

    return application


app = create_app()
