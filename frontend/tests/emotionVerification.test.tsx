import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SemanticSpacePlot } from '@/components/charts/SemanticSpacePlot';
import { EmotionAnalysisPanel } from '@/components/EmotionAnalysisPanel';
import { HumanConfirmedDistributionSection } from '@/components/HumanEmotionVerification';
import { StudioContext, type StudioContextValue } from '@/context/StudioContext';
import { EvaluationDashboardPage } from '@/pages/EvaluationDashboardPage';
import { SemanticExplorerPage } from '@/pages/SemanticExplorerPage';
import { VectorSteeringPage } from '@/pages/VectorSteeringPage';
import type { EmotionAnalyzeResponse, HumanEmotionEvaluationSummary, SemanticMapResponse } from '@/types/api';
import {
  blendEmotionDistributionColor,
  buildDraftRowsFromReview,
  formatEmotionDistributionSummary,
  resolveEffectiveHumanDistribution,
  validateEmotionDistribution,
} from '@/utils/emotionDistribution';

function makeSampleAffectResponse(overrides?: Partial<EmotionAnalyzeResponse>): EmotionAnalyzeResponse {
  return {
    record_id: 'rec-test-1',
    input_text: 'I am thrilled about shipping, yet slightly worried about deadlines.',
    sentiment: {
      predicted_label: 'positive',
      effective_label: 'positive',
      probabilities: { positive: 0.72, neutral: 0.16, negative: 0.12 },
      confidence: 0.72,
      margin: 0.56,
      is_uncertain: false,
      uncertainty_reason: null,
      model_name: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
    },
    emotion: {
      predicted_emotion: 'other',
      raw_top_label: 'caring',
      raw_top_category: 'other',
      confidence: 0.922,
      margin: 0.905,
      is_uncertain: false,
      uncertainty_reason: null,
      probabilities: [
        { label: 'caring', category: 'other', probability: 0.922 },
        { label: 'love', category: 'love', probability: 0.017 },
        { label: 'sadness', category: 'sadness', probability: 0.015 },
        { label: 'joy', category: 'joy', probability: 0.01 },
        { label: 'fear', category: 'fear', probability: 0.008 },
        { label: 'anger', category: 'anger', probability: 0.004 },
      ],
      taxonomy_note: 'GoEmotions taxonomy note.',
      model_name: 'SamLowe/roberta-base-go_emotions',
    },
    embedding_info: {
      model_name: 'all-MiniLM-L6-v2',
      dimensions: 384,
      normalized: true,
      umap_coordinates: { x: 1.0, y: 2.0, z: 3.0 },
      concept: 'positive_sentiment',
      concept_score: 0.35,
      embedding: null,
    },
    nearest_neighbors: [],
    review: {
      review_status: 'corrected',
      human_emotion_label: 'joy',
      human_emotion_distribution: [
        { emotion: 'joy', percentage: 60 },
        { emotion: 'sadness', percentage: 25 },
        { emotion: 'fear', percentage: 15 },
      ],
      human_sentiment_label: 'mixed',
      confirmed_for_evaluation: true,
      rationale: 'Mixed celebratory + anxious emotions.',
      reviewed_at: '2026-11-28T03:30:00Z',
      revision: 2,
      history_count: 2,
    },
    created_at: '2026-11-28T03:25:00Z',
    ...overrides,
  };
}

function makeEmptyStudioContext(): StudioContextValue {
  const sampleMap: SemanticMapResponse = {
    total_points: 1,
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
      sampleText: 'Sample',
      concept: 'formal_tone',
      strength: 0.75,
    }),
    setGuidedExperimentStep: () => {},
    exitGuidedExperiment: () => {},
  };
}

export function runFrontendEmotionVerificationTests(): void {
  // 1. Validation: single 100%, two-emotion 100%, three-emotion (60/25/15), float sum
  const validSingle = validateEmotionDistribution([{ emotion: 'joy', percentageText: '100' }]);
  assert.equal(validSingle.valid, true);
  assert.equal(validSingle.total, 100);

  const validTwo = validateEmotionDistribution([
    { emotion: 'joy', percentageText: '70' },
    { emotion: 'love', percentageText: '30' },
  ]);
  assert.equal(validTwo.valid, true);
  assert.equal(validTwo.total, 100);

  const validThree = validateEmotionDistribution([
    { emotion: 'joy', percentageText: '60' },
    { emotion: 'sadness', percentageText: '25' },
    { emotion: 'fear', percentageText: '15' },
  ]);
  assert.equal(validThree.valid, true);
  assert.equal(validThree.total, 100);

  const validFloat = validateEmotionDistribution([
    { emotion: 'joy', percentageText: '33.3333' },
    { emotion: 'sadness', percentageText: '33.3333' },
    { emotion: 'fear', percentageText: '33.3334' },
  ]);
  assert.equal(validFloat.valid, true);

  // 2. Invalid distributions MUST be rejected without silent normalization
  const invalid90 = validateEmotionDistribution([
    { emotion: 'joy', percentageText: '60' },
    { emotion: 'sadness', percentageText: '30' },
  ]);
  assert.equal(invalid90.valid, false);
  assert.equal(invalid90.total, 90);
  assert.ok(invalid90.errors.some((e) => e.includes('90%')));

  const invalid110 = validateEmotionDistribution([
    { emotion: 'joy', percentageText: '60' },
    { emotion: 'sadness', percentageText: '50' },
  ]);
  assert.equal(invalid110.valid, false);
  assert.equal(invalid110.total, 110);

  const invalidNeg = validateEmotionDistribution([
    { emotion: 'joy', percentageText: '110' },
    { emotion: 'sadness', percentageText: '-10' },
  ]);
  assert.equal(invalidNeg.valid, false);
  assert.ok(invalidNeg.errors.some((e) => e.toLowerCase().includes('negative')));

  const invalidOver100 = validateEmotionDistribution([{ emotion: 'joy', percentageText: '120' }]);
  assert.equal(invalidOver100.valid, false);

  const invalidDup = validateEmotionDistribution([
    { emotion: 'joy', percentageText: '50' },
    { emotion: 'joy', percentageText: '50' },
  ]);
  assert.equal(invalidDup.valid, false);
  assert.ok(invalidDup.errors.some((e) => e.toLowerCase().includes('duplicate')));

  const invalidEmpty = validateEmotionDistribution([]);
  assert.equal(invalidEmpty.valid, false);

  // 3. Historical single-emotion compatibility resolves to 100%
  const legacyDist = resolveEffectiveHumanDistribution({
    reviewStatus: 'corrected',
    humanLabel: 'anger',
    distribution: undefined,
  });
  assert.deepEqual(legacyDist, [{ emotion: 'anger', percentage: 100 }]);

  // Uncertain flags carry NO confirmed percentages
  const uncDist = resolveEffectiveHumanDistribution({
    reviewStatus: 'flagged_uncertain',
    humanLabel: 'uncertain',
    distribution: [{ emotion: 'joy', percentage: 100 }],
  });
  assert.deepEqual(uncDist, []);

  // 4. Blending continuous color for mixed distribution produces valid non-empty hex different from uniform
  const mixedHex = blendEmotionDistributionColor(
    [
      { emotion: 'joy', percentage: 60 },
      { emotion: 'sadness', percentage: 25 },
      { emotion: 'fear', percentage: 15 },
    ],
    'joy'
  );
  assert.match(mixedHex, /^#[0-9a-f]{6}$/i);
  assert.equal(
    formatEmotionDistributionSummary([
      { emotion: 'fear', percentage: 15 },
      { emotion: 'joy', percentage: 60 },
      { emotion: 'sadness', percentage: 25 },
    ]),
    'Joy / Happiness 60% · Sadness 25% · Fear 15%'
  );

  // 5. Draft row builder restores existing distribution when re-editing / reloading
  const sampleAffect = makeSampleAffectResponse();
  const draftRows = buildDraftRowsFromReview(sampleAffect.review, sampleAffect.emotion.predicted_emotion);
  assert.deepEqual(
    draftRows.map((r) => [r.emotion, r.percentageText]),
    [
      ['joy', '60'],
      ['sadness', '25'],
      ['fear', '15'],
    ]
  );

  // 6. EmotionAnalysisPanel keeps immutable Model Probabilities SEPARATE from Human-Confirmed Emotion Distribution
  const panelHtml = renderToStaticMarkup(
    <EmotionAnalysisPanel
      affectResult={sampleAffect}
      initialHistory={[
        {
          history_id: 'h1',
          record_id: 'rec-test-1',
          revision: 1,
          previous_status: 'unreviewed',
          new_status: 'corrected',
          previous_human_emotion: null,
          new_human_emotion: 'joy',
          previous_human_distribution: [],
          new_human_distribution: [{ emotion: 'joy', percentage: 100 }],
          action: 'correct',
          rationale: 'Initial',
          reviewed_at: '2026-11-28T03:26:00Z',
        },
        {
          history_id: 'h2',
          record_id: 'rec-test-1',
          revision: 2,
          previous_status: 'corrected',
          new_status: 'corrected',
          previous_human_emotion: 'joy',
          new_human_emotion: 'joy',
          previous_human_distribution: [{ emotion: 'joy', percentage: 100 }],
          new_human_distribution: [
            { emotion: 'joy', percentage: 60 },
            { emotion: 'sadness', percentage: 25 },
            { emotion: 'fear', percentage: 15 },
          ],
          action: 'correct',
          rationale: 'Mixed celebratory + anxious emotions.',
          reviewed_at: '2026-11-28T03:30:00Z',
        },
      ]}
      loading={false}
      error={null}
      currentInputText={sampleAffect.input_text}
      onReviewUpdated={() => {}}
    />
  );

  assert.ok(panelHtml.includes('Model Probabilities — immutable'));
  assert.ok(panelHtml.includes('92.2%'));
  assert.ok(panelHtml.includes('0.4%'));
  assert.ok(panelHtml.includes('Human-Confirmed Emotion Distribution'));
  assert.ok(panelHtml.includes('Human-confirmed percentages (annotator proportions'));
  assert.ok(panelHtml.includes('Human-Confirmed Sentiment'));
  assert.ok(panelHtml.includes('Mixed'));
  assert.ok(panelHtml.includes('60%'));
  assert.ok(panelHtml.includes('25%'));
  assert.ok(panelHtml.includes('15%'));
  assert.ok(panelHtml.includes('Total: 100% ✓'));
  assert.ok(panelHtml.includes('Revision History (2)'));

  // 7. Uncertain panel display explicitly marks exclusion from ground truth
  const uncHtml = renderToStaticMarkup(
    <HumanConfirmedDistributionSection
      review={{ review_status: 'flagged_uncertain', human_emotion_label: 'uncertain' }}
    />
  );
  assert.ok(uncHtml.includes('Flagged Uncertain'));
  assert.ok(uncHtml.includes('Excluded from confirmed ground-truth evaluation'));

  // 8. EvaluationDashboardPage renders Human-Confirmed Emotion Distribution Evaluation summary
  const evalSummary: HumanEmotionEvaluationSummary = {
    total_records: 3,
    confirmed_ground_truth_count: 1,
    confirmed_count: 0,
    corrected_count: 1,
    excluded_uncertain_count: 1,
    excluded_unreviewed_count: 1,
    mixed_distribution_count: 1,
    single_emotion_count: 0,
    dominant_top1_agreement: 1.0,
    multilabel_target_coverage: 1.0,
    mean_soft_distribution_overlap: 0.72,
    methodology: 'Multi-label target coverage over complete distributions.',
    limitations: 'Excludes uncertain and unreviewed records.',
    records: [
      {
        record_id: 'rec-test-1',
        input_text: sampleAffect.input_text,
        review_status: 'corrected',
        model_predicted_emotion: 'joy',
        model_confidence: 0.71,
        dominant_human_emotion: 'joy',
        human_emotion_distribution: [
          { emotion: 'joy', percentage: 60 },
          { emotion: 'sadness', percentage: 25 },
          { emotion: 'fear', percentage: 15 },
        ],
        is_mixed_human_distribution: true,
        dominant_agreement: true,
        model_top1_in_human_multilabel: true,
        soft_overlap_score: 0.72,
        reviewed_at: '2026-11-28T03:30:00Z',
        revision: 2,
      },
    ],
  };

  const dashHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={makeEmptyStudioContext()}>
        <EvaluationDashboardPage initialHumanSummary={evalSummary} />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  assert.ok(dashHtml.includes('Human-Confirmed Emotion Distribution Evaluation'));
  assert.ok(dashHtml.includes('1 Confirmed Ground-Truth Records'));
  assert.ok(dashHtml.includes('1 uncertain'));
  assert.ok(dashHtml.includes('1 unreviewed'));

  // 9. SemanticSpacePlot renders dual emotion views & VectorSteeringPage / SemanticExplorerPage SSR cleanly
  const sampleMap: SemanticMapResponse = {
    total_points: 1,
    bounds: { x_min: -1, x_max: 1, y_min: -1, y_max: 1, z_min: -1, z_max: 1 },
    clusters: [{ id: 'sentiment', label: 'Sentiment', color: '#38bdf8', point_count: 1 }],
    points: [
      {
        id: 'corp_001',
        text: 'A joyful yet bittersweet memory.',
        category: 'sentiment',
        coordinates: { x: 0.2, y: -0.3, z: 0.1 },
        concept_scores: { positive_sentiment: 0.5, technical_tone: -0.2, formal_tone: 0.0 },
        embedding: null,
        sentiment_label: 'positive',
        emotion_label: 'other',
        emotion_confidence: 0.922,
        human_emotion_label: 'joy',
        human_emotion_distribution: [
          { emotion: 'joy', percentage: 60 },
          { emotion: 'sadness', percentage: 25 },
          { emotion: 'fear', percentage: 15 },
        ],
        human_sentiment_label: 'mixed',
        confirmed_for_evaluation: true,
        emotion_review_status: 'corrected',
      },
    ],
  };

  const plotHtml = renderToStaticMarkup(
    <SemanticSpacePlot mode="2d" colorBy="emotion" semanticMap={sampleMap} />
  );
  assert.ok(plotHtml.includes('Human-Confirmed Results'));
  assert.ok(plotHtml.includes('AI Model Predictions'));
  assert.ok(plotHtml.includes('1 confirmed (1 mixed)'));

  const baseCtx = makeEmptyStudioContext();
  const steerHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider
        value={{
          ...baseCtx,
          semanticMap: sampleMap,
          lastSteerAffectResult: sampleAffect,
        }}
      >
        <VectorSteeringPage />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  assert.ok(steerHtml.includes('Human-Confirmed Emotion Distribution'));
  assert.ok(steerHtml.includes('Model Probabilities — immutable'));

  const explorerHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={{ ...baseCtx, semanticMap: sampleMap }}>
        <SemanticExplorerPage />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  assert.ok(explorerHtml.includes('Dataset Corpus Filter'));

  console.log('ALL 9 FRONTEND PERCENTAGE EMOTION VERIFICATION TEST SUITES PASSED');
}

runFrontendEmotionVerificationTests();
