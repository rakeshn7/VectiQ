import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StudioContext, type StudioContextValue } from '@/context/StudioContext';
import { EvaluationDashboardPage, MetricAuditCard } from '@/pages/EvaluationDashboardPage';
import type { EvaluateResponse, SemanticMapResponse } from '@/types/api';
import {
  buildGoal1Metrics,
  buildGoal2Metrics,
  buildGoal3Metrics,
} from '@/utils/evaluationMetrics';

function createSampleEvaluateResponse(): EvaluateResponse {
  return {
    input_text: 'The system architecture is simple, direct, and fast.',
    concept: 'formal_tone',
    base_concept_score: -0.1423,
    steps: [
      {
        strength: -0.5,
        concept_score: -0.4512,
        semantic_preservation: 0.9012,
        neighbor_stability: 0.6,
        coordinates: { x: 1.0, y: 2.0, z: 3.0 },
        nearest_neighbors: [],
      },
      {
        strength: 0.0,
        concept_score: -0.1423,
        semantic_preservation: 1.0,
        neighbor_stability: 1.0,
        coordinates: { x: 1.2, y: 2.1, z: 3.1 },
        nearest_neighbors: [],
      },
      {
        strength: 0.5,
        concept_score: 0.2891,
        semantic_preservation: 0.8964,
        neighbor_stability: 0.6,
        coordinates: { x: 1.4, y: 2.3, z: 3.4 },
        nearest_neighbors: [],
      },
    ],
    metrics_summary: {
      monotonicity: {
        is_monotonic: true,
        spearman_correlation: 1.0,
        pearson_correlation: 0.9962,
        directional_consistency: 1.0,
      },
      preservation_retention: {
        mean_preservation: 0.9325,
        min_preservation: 0.8964,
        preservation_decay_rate: 0.1036,
      },
      stability_summary: {
        mean_neighbor_stability: 0.7333,
        min_neighbor_stability: 0.6,
        retained_original_neighbors_at_max: 3,
      },
      linearity_score: 0.9924,
      umap_trustworthiness: 0.938619,
      umap_trustworthiness_detail: {
        value: 0.938619,
        status: 'computed',
        sample_size: 360,
        parameters: { k: 15, metric: 'cosine' },
        methodology: 'sklearn.manifold.trustworthiness on 3D UMAP',
        limitations: 'Precision only; does not evaluate continuity.',
      },
      umap_continuity_2d: {
        value: 0.9124,
        status: 'computed',
        sample_size: 360,
        parameters: { k: 15, knn_recall_vs_384d: 0.44 },
        methodology: 'Venna & Kaski continuity on 2D slice',
        limitations: '2D view slices (x, y) from 3D UMAP.',
      },
      umap_continuity_3d: {
        value: 0.9412,
        status: 'computed',
        sample_size: 360,
        parameters: { k: 15, knn_recall_vs_384d: 0.51 },
        methodology: 'Venna & Kaski continuity on 3D UMAP',
        limitations: 'Recall metric distinct from trustworthiness.',
      },
      neighborhood_overlap_2d_3d: {
        value: 0.742,
        status: 'computed',
        sample_size: 360,
        parameters: { k: 5 },
        methodology: 'Top-k Euclidean overlap between 2D and 3D',
        limitations: 'Strictly compares 2D vs 3D projected spaces.',
        mean_jaccard: 0.618,
        min_overlap: 0.2,
        max_overlap: 1.0,
        projected_vs_384d_overlap_2d: 0.35,
        projected_vs_384d_overlap_3d: 0.46,
        point_examples: [{ id: 'corp_001', overlap_rate: 0.8, jaccard: 0.667 }],
      },
      projection_distortion_2d: {
        value: 0.3912,
        status: 'computed',
        sample_size: 360,
        parameters: { pair_count: 64620 },
        methodology: 'Spearman & Kruskal Stress-1 on 2D slice',
        limitations: 'UMAP preserves local topology over global distances.',
        spearman_correlation: 0.3912,
        pearson_correlation: 0.3521,
        kruskal_stress_1: 0.388,
        pair_count: 64620,
      },
      projection_distortion_3d: {
        value: 0.4315,
        status: 'computed',
        sample_size: 360,
        parameters: { pair_count: 64620 },
        methodology: 'Spearman & Kruskal Stress-1 on 3D UMAP',
        limitations: 'UMAP preserves local topology over global distances.',
        spearman_correlation: 0.4315,
        pearson_correlation: 0.4012,
        kruskal_stress_1: 0.362,
        pair_count: 64620,
      },
      transform_stability: {
        value: 0.1021,
        status: 'partial',
        sample_size: 3,
        parameters: { umap_refit_during_test: false },
        methodology: 'Repeat batch, reversed order, and single-vs-batch UMAP transforms',
        limitations: 'Single vs batch shows expected umap-learn coupling drift.',
        runs: 2,
        tolerance: 1e-5,
        repeat_batch_max_diff: 0.0,
        order_invariance_max_diff: 0.0,
        single_vs_batch_max_diff: 0.1021,
        single_vs_batch_mean_diff: 0.0681,
        is_deterministic: true,
        is_order_invariant: true,
        is_batch_composition_invariant: false,
      },
      unit_norm_validation: {
        value: 1.0,
        status: 'passed',
        sample_size: 4,
        parameters: { tolerance: 1e-4 },
        methodology: 'Raw ||E||_2 checked without normalization',
        limitations: 'Norm validity does not guarantee paraphrase equivalence.',
        original_norm: 1.0,
        steered_norms: [
          { label: 'steered_lambda_-0.500', strength: -0.5, norm: 1.0, deviation: 0.0, is_valid: true },
          { label: 'steered_lambda_+0.000', strength: 0.0, norm: 1.0, deviation: 0.0, is_valid: true },
          { label: 'steered_lambda_+0.500', strength: 0.5, norm: 1.0, deviation: 0.0, is_valid: true },
        ],
        valid_count: 4,
        invalid_count: 0,
        total_tested: 4,
        tolerance: 1e-4,
        min_norm: 0.999999,
        max_norm: 1.000001,
        max_deviation: 1e-6,
        nan_count: 0,
        inf_count: 0,
        zero_vector_count: 0,
        wrong_dim_count: 0,
      },
      vector_displacement_alignment: {
        value: 0.9682,
        status: 'computed',
        sample_size: 2,
        parameters: { concept: 'formal_tone', nonzero_steps: 2 },
        methodology: 'cos(E\' - E, sign(lambda) * D) on nonzero steps',
        limitations: 'Normalization curves large |lambda| steps.',
        concept: 'formal_tone',
        positive_mean_alignment: 0.9681,
        negative_mean_alignment: 0.9683,
        zero_strength_handled: true,
        original_vector_id: 'vec_orig_abc12345',
        step_alignments: [],
      },
      steering_repeatability: {
        value: 1.0,
        status: 'passed',
        sample_size: 9,
        parameters: { runs_per_strength: 3 },
        methodology: '3 repeated steering executions per strength',
        limitations: 'Tests deterministic arithmetic on frozen input embeddings.',
        runs: 3,
        max_vector_diff: 0.0,
        mean_vector_diff: 0.0,
        min_vector_cosine: 1.0,
        max_displacement_diff: 0.0,
        is_consistent: true,
      },
    },
  };
}

function makeStudioContext(overrides: Partial<StudioContextValue>): StudioContextValue {
  const sampleMap: SemanticMapResponse = {
    total_points: 360,
    bounds: { x_min: -1, x_max: 1, y_min: -1, y_max: 1, z_min: -1, z_max: 1 },
    clusters: [],
    points: [],
  };
  return {
    connectionStatus: 'connected',
    health: null,
    contractHealth: null,
    healthError: null,
    config: null,
    configError: null,
    isRefreshingStatus: false,
    lastCheckedAt: null,
    refreshBackendStatus: async () => {},
    semanticMap: sampleMap,
    semanticMapLoading: false,
    semanticMapError: null,
    loadSemanticMap: async () => {},
    lastSteerRequest: null,
    lastSteerResult: null,
    lastSteerAffectResult: null,
    steerHistory: [],
    setActiveSteerRun: () => {},
    setLastSteerAffectResult: () => {},
    selectSteerResultFromHistory: () => {},
    clearActiveSteerRun: () => {},
    lastEvaluateRequest: null,
    lastEvaluateResult: null,
    setActiveEvaluateRun: () => {},
    experienceMode: 'simple',
    setExperienceMode: () => {},
    guidedExperiment: null,
    startGuidedExperiment: () => ({
      active: true,
      step: 1,
      sampleText: 'The software engineering team shipped a clean, reliable release ahead of schedule.',
      concept: 'formal_tone',
      strength: 0.75,
    }),
    setGuidedExperimentStep: () => {},
    exitGuidedExperiment: () => {},
    ...overrides,
  };
}

export function runFrontendEvaluationTests(): void {
  const sampleRes = createSampleEvaluateResponse();
  const meta = {
    sortedStepCount: 3,
    topK: 5,
    corpusTotalPoints: 360,
    baselinePreservation: 1.0,
    baselineNeighborStability: 1.0,
    hasMissingStepCoords: false,
  };

  // 1. Field mapping & non-unavailable checks
  const g1 = buildGoal1Metrics(sampleRes, meta);
  const g2 = buildGoal2Metrics(sampleRes, meta);
  const g3 = buildGoal3Metrics(sampleRes, meta);
  const all = [...g1, ...g2, ...g3];
  assert.equal(g1.length, 5);
  assert.equal(g2.length, 4);
  assert.equal(g3.length, 7);
  for (const card of all) {
    assert.equal(card.unavailable, false, `Expected card ${card.id} to be available`);
    assert.ok(!card.actualDisplay.includes('Unavailable'), `Card ${card.id} unexpected Unavailable`);
  }
  assert.ok(all.find((c) => c.id === 'umap-continuity-2d')?.actualDisplay.includes('0.9124'));
  assert.ok(all.find((c) => c.id === 'umap-continuity-3d')?.actualDisplay.includes('0.9412'));
  assert.ok(all.find((c) => c.id === 'neighborhood-overlap-2d-3d')?.actualDisplay.includes('74.2%'));
  assert.ok(all.find((c) => c.id === 'unit-norm-validation')?.actualDisplay.includes('4/4 Valid'));
  assert.ok(all.find((c) => c.id === 'vector-displacement-alignment')?.actualDisplay.includes('0.9682'));
  assert.ok(all.find((c) => c.id === 'steering-repeatability')?.actualDisplay.includes('1.0000'));

  // 2 & 3 & 7. Full React SSR rendering: values, sample sizes, parameters & expanded technical details
  const popCtx = makeStudioContext({ lastEvaluateResult: sampleRes });
  const popHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={popCtx}>
        <EvaluationDashboardPage defaultExpandDetails />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  assert.ok(!popHtml.includes('Unavailable from API'));
  assert.ok(!popHtml.includes('Unavailable in /evaluate'));
  assert.ok(popHtml.includes('UMAP Continuity (2D Slice)'));
  assert.ok(popHtml.includes('UMAP Continuity (3D)'));
  assert.ok(popHtml.includes('0.9124') && popHtml.includes('0.9412'));
  assert.ok(popHtml.includes('74.2%'));
  assert.ok(popHtml.includes('0.3912') && popHtml.includes('0.4315'));
  assert.ok(popHtml.includes('64,620 pairs'));
  assert.ok(popHtml.includes('4/4 Valid'));
  assert.ok(popHtml.includes('0.9682'));
  assert.ok(popHtml.includes('Sample size: 360 corpus points (k=15)'));
  assert.ok(popHtml.includes('Sample size: 4 vectors (1 original + 3 steered)'));
  assert.ok(popHtml.includes('open=""') || popHtml.includes('<details open'));
  assert.ok(popHtml.includes('1. Definition:'));
  assert.ok(popHtml.includes('7. Limitations:'));

  // 4. Loading state rendering
  const loadHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={makeStudioContext({})}>
        <EvaluationDashboardPage initialLoading />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  assert.ok(loadHtml.includes('Running Multi-Step Steering Evaluation'));

  // 5. Error state rendering
  const errHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={makeStudioContext({})}>
        <EvaluationDashboardPage
          initialError={{
            status: 503,
            code: 'ENGINE_NOT_READY',
            message: 'Evaluation engine not ready',
            details: [],
            isNetworkError: false,
            isNotImplemented: false,
          }}
        />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  assert.ok(errHtml.includes('Evaluation engine not ready'));
  assert.ok(errHtml.includes('ENGINE_NOT_READY'));

  // 6. Unavailable metric handling when backend explicitly returns status=unavailable
  const unavailSample: EvaluateResponse = {
    ...sampleRes,
    metrics_summary: {
      ...sampleRes.metrics_summary,
      umap_continuity_2d: {
        value: null,
        status: 'unavailable',
        sample_size: 2,
        parameters: { k: 15 },
        methodology: 'Venna & Kaski continuity',
        limitations: 'Needs >= 4 points.',
        unavailable_reason: 'At least 4 valid points are required (got 2).',
      },
      vector_displacement_alignment: {
        ...sampleRes.metrics_summary.vector_displacement_alignment!,
        value: null,
        status: 'unavailable',
        sample_size: 0,
        unavailable_reason: 'No nonzero displacement steps present.',
      },
    },
  };
  const g3Unavail = buildGoal3Metrics(unavailSample, meta);
  const cont2dCard = g3Unavail.find((c) => c.id === 'umap-continuity-2d')!;
  assert.equal(cont2dCard.unavailable, true);
  assert.equal(cont2dCard.actualDisplay, 'Unavailable');
  const cardHtml = renderToStaticMarkup(<MetricAuditCard spec={cont2dCard} defaultOpen />);
  assert.ok(cardHtml.includes('At least 4 valid points are required (got 2).'));

  console.log('ALL 7 FRONTEND EVALUATION DASHBOARD TEST SUITES PASSED');
}

runFrontendEvaluationTests();
