/**
 * API Types Foundation for Semantic Space Studio
 * 
 * Shared contract status: contracts/api-contract.md is not yet finalized.
 * This file serves as the type foundation ready for contract implementation.
 * 
 * Once contracts/api-contract.md is created and agreed upon with the backend team,
 * concrete request/response types for:
 *  - Embedding generation
 *  - Vector steering
 *  - Projection / dimensionality reduction
 *  - Evaluation metrics
 * will be defined here.
 */

export interface ApiResponse<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface ApiStatus {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
}
