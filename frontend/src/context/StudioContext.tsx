import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchConfig,
  fetchHealth,
  fetchSemanticMap,
  parseApiError,
  type ParsedApiError,
  type RawHealthPayload,
} from '@/services';
import type {
  ConceptId,
  ConfigResponse,
  EmotionAnalyzeResponse,
  EvaluateRequest,
  EvaluateResponse,
  HealthResponse,
  SemanticMapQueryParams,
  SemanticMapResponse,
  SteerRequest,
  SteerResponse,
} from '@/types/api';

export type ConnectionStatus = 'checking' | 'connected' | 'partial' | 'offline';
export type ExperienceMode = 'simple' | 'research';

export interface GuidedExperimentState {
  active: boolean;
  step: 1 | 2 | 3;
  sampleText: string;
  concept: ConceptId;
  strength: number;
}

export const GUIDED_SAMPLE_SENTENCE =
  'The software engineering team shipped a clean, reliable release ahead of schedule.';

const EXPERIENCE_MODE_STORAGE_KEY = 'vectiq_experience_mode';

function readInitialExperienceMode(): ExperienceMode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY);
      if (saved === 'simple' || saved === 'research') {
        return saved;
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return 'simple';
}

export interface StudioContextValue {
  connectionStatus: ConnectionStatus;
  health: RawHealthPayload | null;
  contractHealth: HealthResponse | null;
  healthError: ParsedApiError | null;
  config: ConfigResponse | null;
  configError: ParsedApiError | null;
  isRefreshingStatus: boolean;
  lastCheckedAt: string | null;
  refreshBackendStatus: () => Promise<void>;

  semanticMap: SemanticMapResponse | null;
  semanticMapLoading: boolean;
  semanticMapError: ParsedApiError | null;
  loadSemanticMap: (params?: SemanticMapQueryParams, force?: boolean) => Promise<void>;

  lastSteerRequest: SteerRequest | null;
  lastSteerResult: SteerResponse | null;
  lastSteerAffectResult: EmotionAnalyzeResponse | null;
  steerHistory: SteerResponse[];
  setActiveSteerRun: (request: SteerRequest, result: SteerResponse) => void;
  setLastSteerAffectResult: React.Dispatch<React.SetStateAction<EmotionAnalyzeResponse | null>>;
  selectSteerResultFromHistory: (result: SteerResponse) => void;
  clearActiveSteerRun: () => void;

  lastEvaluateRequest: EvaluateRequest | null;
  lastEvaluateResult: EvaluateResponse | null;
  setActiveEvaluateRun: (request: EvaluateRequest, result: EvaluateResponse) => void;

  experienceMode: ExperienceMode;
  setExperienceMode: (mode: ExperienceMode) => void;

  guidedExperiment: GuidedExperimentState | null;
  startGuidedExperiment: () => GuidedExperimentState;
  setGuidedExperimentStep: (step: 1 | 2 | 3) => void;
  exitGuidedExperiment: () => void;
}

export const StudioContext = createContext<StudioContextValue | undefined>(undefined);

function isContractHealthResponse(payload: RawHealthPayload | null): payload is HealthResponse {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      'model_loaded' in payload &&
      'umap_fitted' in payload
  );
}

export const StudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [health, setHealth] = useState<RawHealthPayload | null>(null);
  const [healthError, setHealthError] = useState<ParsedApiError | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [configError, setConfigError] = useState<ParsedApiError | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState<boolean>(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const [semanticMap, setSemanticMap] = useState<SemanticMapResponse | null>(null);
  const [semanticMapLoading, setSemanticMapLoading] = useState<boolean>(false);
  const [semanticMapError, setSemanticMapError] = useState<ParsedApiError | null>(null);

  const semanticMapRef = useRef<SemanticMapResponse | null>(null);
  const semanticMapInFlightRef = useRef<boolean>(false);

  const [lastSteerRequest, setLastSteerRequest] = useState<SteerRequest | null>(null);
  const [lastSteerResult, setLastSteerResult] = useState<SteerResponse | null>(null);
  const [lastSteerAffectResult, setLastSteerAffectResult] =
    useState<EmotionAnalyzeResponse | null>(null);
  const [steerHistory, setSteerHistory] = useState<SteerResponse[]>([]);

  const [lastEvaluateRequest, setLastEvaluateRequest] = useState<EvaluateRequest | null>(null);
  const [lastEvaluateResult, setLastEvaluateResult] = useState<EvaluateResponse | null>(null);

  const [experienceMode, setExperienceModeState] = useState<ExperienceMode>(
    readInitialExperienceMode
  );
  const [guidedExperiment, setGuidedExperiment] = useState<GuidedExperimentState | null>(null);

  const setExperienceMode = useCallback((mode: ExperienceMode) => {
    setExperienceModeState(mode);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, mode);
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const startGuidedExperiment = useCallback((): GuidedExperimentState => {
    const initial: GuidedExperimentState = {
      active: true,
      step: 1,
      sampleText: GUIDED_SAMPLE_SENTENCE,
      concept: 'formal_tone',
      strength: 0.75,
    };
    setGuidedExperiment(initial);
    return initial;
  }, []);

  const setGuidedExperimentStep = useCallback((step: 1 | 2 | 3) => {
    setGuidedExperiment((prev) => (prev ? { ...prev, step } : null));
  }, []);

  const exitGuidedExperiment = useCallback(() => {
    setGuidedExperiment(null);
  }, []);

  const refreshBackendStatus = useCallback(async () => {
    setIsRefreshingStatus(true);
    const [healthRes, configRes] = await Promise.allSettled([fetchHealth(), fetchConfig()]);

    if (healthRes.status === 'fulfilled') {
      setHealth(healthRes.value);
      setHealthError(null);
    } else {
      setHealth(null);
      setHealthError(parseApiError(healthRes.reason));
    }

    if (configRes.status === 'fulfilled') {
      setConfig(configRes.value);
      setConfigError(null);
    } else {
      setConfig(null);
      setConfigError(parseApiError(configRes.reason));
    }

    setLastCheckedAt(new Date().toISOString());
    setIsRefreshingStatus(false);
  }, []);

  useEffect(() => {
    void refreshBackendStatus();
  }, [refreshBackendStatus]);

  const loadSemanticMap = useCallback(async (params?: SemanticMapQueryParams, force = false) => {
    if (semanticMapInFlightRef.current) return;
    if (semanticMapRef.current && !force && !params) return;

    semanticMapInFlightRef.current = true;
    setSemanticMapLoading(true);
    setSemanticMapError(null);

    try {
      const effectiveParams: SemanticMapQueryParams = {
        limit: 1000,
        ...params,
      };
      const data = await fetchSemanticMap(effectiveParams);
      semanticMapRef.current = data;
      setSemanticMap(data);
    } catch (err) {
      setSemanticMapError(parseApiError(err));
    } finally {
      semanticMapInFlightRef.current = false;
      setSemanticMapLoading(false);
    }
  }, []);

  const setActiveSteerRun = useCallback((request: SteerRequest, result: SteerResponse) => {
    setLastSteerRequest(request);
    setLastSteerResult(result);
    setSteerHistory((prev) => {
      const filtered = prev.filter(
        (item) =>
          !(
            item.input_text === result.input_text &&
            item.concept === result.concept &&
            item.strength === result.strength
          )
      );
      return [result, ...filtered].slice(0, 10);
    });
  }, []);

  const selectSteerResultFromHistory = useCallback((result: SteerResponse) => {
    setLastSteerResult(result);
    setLastSteerRequest({
      text: result.input_text,
      concept: result.concept,
      strength: result.strength,
      top_k_neighbors: result.original.nearest_neighbors.length || 5,
      include_embeddings: Boolean(result.original.embedding && result.steered.embedding),
    });
  }, []);

  const clearActiveSteerRun = useCallback(() => {
    setLastSteerRequest(null);
    setLastSteerResult(null);
    setLastSteerAffectResult(null);
  }, []);

  const setActiveEvaluateRun = useCallback((request: EvaluateRequest, result: EvaluateResponse) => {
    setLastEvaluateRequest(request);
    setLastEvaluateResult(result);
  }, []);

  const contractHealth = useMemo(
    () => (isContractHealthResponse(health) ? health : null),
    [health]
  );

  const connectionStatus: ConnectionStatus = useMemo(() => {
    if (isRefreshingStatus && !health && !healthError) return 'checking';
    if (!health) return 'offline';
    if (contractHealth && contractHealth.model_loaded && contractHealth.umap_fitted && config) {
      return 'connected';
    }
    if (config && (health.status === 'healthy' || health.status === 'ok')) {
      return 'connected';
    }
    return 'partial';
  }, [isRefreshingStatus, health, healthError, contractHealth, config]);

  const value = useMemo<StudioContextValue>(
    () => ({
      connectionStatus,
      health,
      contractHealth,
      healthError,
      config,
      configError,
      isRefreshingStatus,
      lastCheckedAt,
      refreshBackendStatus,
      semanticMap,
      semanticMapLoading,
      semanticMapError,
      loadSemanticMap,
      lastSteerRequest,
      lastSteerResult,
      lastSteerAffectResult,
      steerHistory,
      setActiveSteerRun,
      setLastSteerAffectResult,
      selectSteerResultFromHistory,
      clearActiveSteerRun,
      lastEvaluateRequest,
      lastEvaluateResult,
      setActiveEvaluateRun,
      experienceMode,
      setExperienceMode,
      guidedExperiment,
      startGuidedExperiment,
      setGuidedExperimentStep,
      exitGuidedExperiment,
    }),
    [
      connectionStatus,
      health,
      contractHealth,
      healthError,
      config,
      configError,
      isRefreshingStatus,
      lastCheckedAt,
      refreshBackendStatus,
      semanticMap,
      semanticMapLoading,
      semanticMapError,
      loadSemanticMap,
      lastSteerRequest,
      lastSteerResult,
      lastSteerAffectResult,
      steerHistory,
      setActiveSteerRun,
      selectSteerResultFromHistory,
      clearActiveSteerRun,
      lastEvaluateRequest,
      lastEvaluateResult,
      setActiveEvaluateRun,
      experienceMode,
      setExperienceMode,
      guidedExperiment,
      startGuidedExperiment,
      setGuidedExperimentStep,
      exitGuidedExperiment,
    ]
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
};
