"""Base Pydantic schemas for the Semantic Space Studio API."""

from pydantic import BaseModel, Field


class RootResponse(BaseModel):
    """Response model for the API root endpoint."""

    message: str = Field(..., description="Welcome message for the API.")
    service: str = Field(..., description="Application service name.")
    version: str = Field(..., description="API version.")
    docs_url: str = Field(default="/docs", description="OpenAPI documentation path.")


class HealthResponse(BaseModel):
    """Response model for the API health-check endpoint."""

    status: str = Field(..., description="Service health status.")
    service: str = Field(..., description="Application service name.")
    version: str = Field(..., description="API version.")
    environment: str = Field(..., description="Active runtime environment.")

