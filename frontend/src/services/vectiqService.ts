import apiClient, { API_V1_PREFIX } from '@/services/api';
import type {
  ConfigResponse,
  EmotionAnalyzeRequest,
  EmotionAnalyzeResponse,
  EmotionReviewRequest,
  EmotionReviewResponse,
  EvaluateRequest,
  EvaluateResponse,
  HealthResponse,
  HumanEmotionEvaluationSummary,
  SemanticMapQueryParams,
  SemanticMapResponse,
  SteerRequest,
  SteerResponse,
} from '@/types/api';

/**
 * Health payload may come from either full contract implementation (contracts/api-contract.md)
 * or the early backend initialization stub ({ status: "ok", service, version, environment }).
 */
export type RawHealthPayload =
  | HealthResponse
  | {
      status: string;
      service?: string;
      version?: string;
      environment?: string;
    };

export async function fetchHealth(): Promise<RawHealthPayload> {
  const { data } = await apiClient.get<RawHealthPayload>(`${API_V1_PREFIX}/health`);
  return data;
}

export async function fetchConfig(): Promise<ConfigResponse> {
  const { data } = await apiClient.get<ConfigResponse>(`${API_V1_PREFIX}/config`);
  return data;
}

export async function fetchSemanticMap(
  params?: SemanticMapQueryParams
): Promise<SemanticMapResponse> {
  const { data } = await apiClient.get<SemanticMapResponse>(`${API_V1_PREFIX}/semantic-map`, {
    params,
  });
  return data;
}

export async function steerEmbedding(payload: SteerRequest): Promise<SteerResponse> {
  const { data } = await apiClient.post<SteerResponse>(`${API_V1_PREFIX}/steer`, payload);
  return data;
}

export async function evaluateSteering(payload: EvaluateRequest): Promise<EvaluateResponse> {
  const { data } = await apiClient.post<EvaluateResponse>(`${API_V1_PREFIX}/evaluate`, payload);
  return data;
}

export async function analyzeSentenceAffect(
  payload: EmotionAnalyzeRequest
): Promise<EmotionAnalyzeResponse> {
  const { data } = await apiClient.post<EmotionAnalyzeResponse>(
    `${API_V1_PREFIX}/emotions/analyze`,
    payload
  );
  return data;
}

export async function submitEmotionVerification(
  payload: EmotionReviewRequest
): Promise<EmotionReviewResponse> {
  const { data } = await apiClient.post<EmotionReviewResponse>(
    `${API_V1_PREFIX}/emotions/reviews`,
    payload
  );
  return data;
}

export async function fetchEmotionVerification(
  recordId: string
): Promise<EmotionReviewResponse> {
  const { data } = await apiClient.get<EmotionReviewResponse>(
    `${API_V1_PREFIX}/emotions/reviews/${encodeURIComponent(recordId)}`
  );
  return data;
}

export async function fetchEmotionEvaluationSummary(): Promise<HumanEmotionEvaluationSummary> {
  const { data } = await apiClient.get<HumanEmotionEvaluationSummary>(
    `${API_V1_PREFIX}/emotions/evaluation-summary`
  );
  return data;
}
