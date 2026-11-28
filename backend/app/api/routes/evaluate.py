"""Steering evaluation API route."""

from fastapi import APIRouter, Depends

from app.api.dependencies import get_ready_container
from app.models.schemas import ErrorResponse, EvaluateRequest, EvaluateResponse
from app.services.container import ServiceContainer

router = APIRouter(tags=["Evaluation"])


@router.post(
    "/evaluate",
    response_model=EvaluateResponse,
    responses={
        400: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
    summary="Evaluate Vector Steering Trajectory",
    description="Sweep steering strengths and compute monotonicity, semantic preservation, and neighbor stability metrics.",
)
def evaluate_steering(
    payload: EvaluateRequest,
    container: ServiceContainer = Depends(get_ready_container),
) -> EvaluateResponse:
    """Evaluate steering quality across requested strengths."""
    assert payload.strengths is not None
    return container.evaluation_service.evaluate(
        text=payload.text,
        concept=payload.concept,
        strengths=payload.strengths,
        top_k_neighbors=payload.top_k_neighbors,
        continuity_k=payload.continuity_k,
        overlap_k=payload.overlap_k,
    )

