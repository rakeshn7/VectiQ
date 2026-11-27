import axios, { AxiosError } from 'axios';
import type { ApiErrorDetail, ApiErrorResponse } from '@/types/api';

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');
export const API_V1_PREFIX = '/api/v1';

export interface ParsedApiError {
  status: number | null;
  code: string;
  message: string;
  details: ApiErrorDetail[];
  isNetworkError: boolean;
  isNotImplemented: boolean;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 30000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    const parsed = parseApiError(error);
    console.error(`[API ${parsed.status ?? 'NETWORK'}]: ${parsed.code} - ${parsed.message}`);
    return Promise.reject(error);
  }
);

/**
 * Normalizes Axios, FastAPI 422, and contract ApiErrorResponse payloads into a consistent UI error object.
 */
export function parseApiError(error: unknown): ParsedApiError {
  if (!axios.isAxiosError(error)) {
    return {
      status: null,
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
      details: [],
      isNetworkError: false,
      isNotImplemented: false,
    };
  }

  if (!error.response) {
    const isTimeout = error.code === 'ECONNABORTED';
    return {
      status: null,
      code: isTimeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      message: isTimeout
        ? 'Backend request timed out while waiting for inference.'
        : `Cannot reach backend server at ${API_BASE_URL}. Ensure FastAPI is running.`,
      details: [],
      isNetworkError: true,
      isNotImplemented: false,
    };
  }

  const { status, data } = error.response;

  // Contract-compliant error envelope
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return {
      status: data.error.status ?? status,
      code: data.error.code || `HTTP_${status}`,
      message: data.error.message || error.message,
      details: Array.isArray(data.error.details) ? data.error.details : [],
      isNetworkError: false,
      isNotImplemented: status === 404 || status === 501,
    };
  }

  // Default FastAPI validation detail array fallback
  const fastApiDetail = (data as { detail?: unknown })?.detail;
  if (Array.isArray(fastApiDetail)) {
    const details: ApiErrorDetail[] = fastApiDetail.map((item) => {
      const entry = item as { loc?: unknown[]; msg?: string; input?: unknown };
      const field = Array.isArray(entry.loc) ? entry.loc.map(String).join('.') : undefined;
      return {
        field,
        issue: entry.msg || 'Validation error',
        value: entry.input,
      };
    });
    return {
      status,
      code: 'VALIDATION_ERROR',
      message: 'Input validation failed on one or more fields.',
      details,
      isNetworkError: false,
      isNotImplemented: false,
    };
  }

  if (typeof fastApiDetail === 'string') {
    return {
      status,
      code: status === 404 ? 'ENDPOINT_NOT_FOUND' : `HTTP_${status}`,
      message:
        status === 404
          ? 'Endpoint not implemented on the connected backend yet.'
          : fastApiDetail,
      details: [],
      isNetworkError: false,
      isNotImplemented: status === 404 || status === 501,
    };
  }

  return {
    status,
    code: `HTTP_${status}`,
    message: error.message || `Request failed with status ${status}.`,
    details: [],
    isNetworkError: false,
    isNotImplemented: status === 404 || status === 501,
  };
}

export default apiClient;
