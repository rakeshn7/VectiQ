"""Custom exception types and error response helpers matching contracts/api-contract.md."""

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import status


def utc_timestamp_iso() -> str:
    """Return current UTC timestamp formatted in ISO-8601 Z notation."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_error_payload(
    *,
    code: str,
    message: str,
    status_code: int,
    details: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Build standard ErrorResponse JSON envelope."""
    payload: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "status": status_code,
            "timestamp": utc_timestamp_iso(),
        }
    }
    if details is not None:
        payload["error"]["details"] = details
    return payload


class VectiQError(Exception):
    """Base application exception mapped to standardized JSON error responses."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class EngineNotReadyError(VectiQError):
    """Raised when model, corpus, or UMAP projection is unavailable."""

    def __init__(
        self,
        message: str = "Embedding model or UMAP projection pipeline is not ready.",
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(
            code="SERVICE_UNAVAILABLE",
            message=message,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details,
        )


class InvalidInputError(VectiQError):
    """Raised on domain validation errors (e.g., empty text, invalid range)."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "VALIDATION_ERROR",
        status_code: int = 422,
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status_code=status_code,
            details=details,
        )

