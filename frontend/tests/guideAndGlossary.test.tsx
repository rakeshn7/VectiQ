import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { GuideModal } from '@/components/GuideModal';
import { GuidedWalkthroughBanner } from '@/components/GuidedWalkthroughBanner';
import { StudioContext, type StudioContextValue } from '@/context/StudioContext';
import {
  filterGlossaryEntries,
  GLOSSARY_CATEGORIES,
  GLOSSARY_ENTRIES,
} from '@/data/glossaryData';
import { LandingPage } from '@/pages/LandingPage';

function makeLandingContext(overrides: Partial<StudioContextValue> = {}): StudioContextValue {
  return {
    connectionStatus: 'connected',
    health: {
      status: 'healthy',
      version: '1.0.0',
      model_loaded: true,
      umap_fitted: true,
      corpus_size: 360,
      timestamp: '2026-11-28T00:00:00Z',
    },
    contractHealth: {
      status: 'healthy',
      version: '1.0.0',
      model_loaded: true,
      umap_fitted: true,
      corpus_size: 360,
      timestamp: '2026-11-28T00:00:00Z',
    },
    healthError: null,
    config: null,
    configError: null,
    isRefreshingStatus: false,
    lastCheckedAt: null,
    refreshBackendStatus: async () => {},
    semanticMap: null,
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

export function runGuideAndGlossaryTests(): void {
  // 1. Landing navigation items & visible Guide button
  const landingHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={makeLandingContext()}>
        <LandingPage />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  for (const navLabel of [
    'VectiQ',
    'Semantic Space Studio',
    'Overview',
    'Workspaces',
    'Methodology',
    'Simple',
    'Research',
    'Guide',
    'Model Online',
    'Open Studio',
  ]) {
    assert.ok(landingHtml.includes(navLabel), `Landing page missing nav item: ${navLabel}`);
  }
  assert.ok(landingHtml.includes('Who It'));

  // 2 & 3. Modal open on Quick Walkthrough tab + 4 cards + footer actions
  const modalWalkHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={makeLandingContext()}>
        <LandingPage initialGuideOpen initialGuideTab="walkthrough" />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  for (const text of [
    'VectiQ Orientation &amp; Research Glossary',
    'WHAT VECTIQ DOES (AND DOES NOT DO)',
    'all-MiniLM-L6-v2',
    'It does not use a generative LLM to rewrite or invent new sentences.',
    '1. Semantic Space',
    '2. Reading the 3D Map',
    '3. Vector Steering',
    '4. Compare &amp; Evaluate',
    'Skip guide for now',
    'Run Guided Sample Experiment',
    'Quick Walkthrough',
    'Parameter Glossary',
    'Role Pathways',
  ]) {
    assert.ok(modalWalkHtml.includes(text), `Walkthrough missing expected text: ${text}`);
  }

  // 4. Complete Parameter Glossary coverage, categories, search, and Simple vs Research modes
  assert.equal(GLOSSARY_CATEGORIES.length, 6);
  assert.ok(GLOSSARY_ENTRIES.length >= 52);

  for (const entry of GLOSSARY_ENTRIES) {
    assert.ok(entry.parameterName.length > 0);
    assert.ok(entry.simpleExplanation.length > 10);
    assert.ok(entry.technicalExplanation.length > 10);
    assert.ok(entry.formulaOrExample.length > 0);
    assert.ok(entry.whereUsed.length >= 1);
  }

  const simThreshold = GLOSSARY_ENTRIES.find((e) => e.id === 'sim-threshold');
  assert.ok(simThreshold && simThreshold.notImplemented === true);

  const searchRes = filterGlossaryEntries(GLOSSARY_ENTRIES, 'Kruskal', 'evaluation');
  assert.equal(searchRes.length, 1);
  assert.equal(searchRes[0].id, 'eval-distortion');

  const glossarySimpleHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={makeLandingContext({ experienceMode: 'simple' })}>
        <GuideModal open initialTab="glossary" onClose={() => {}} />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  assert.ok(glossarySimpleHtml.includes('Not currently implemented'));
  assert.ok(glossarySimpleHtml.includes('Simple Mode'));
  assert.ok(glossarySimpleHtml.includes('Showing 52 of 52 documented parameters'));

  const glossaryResearchHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={makeLandingContext({ experienceMode: 'research' })}>
        <GuideModal open initialTab="glossary" onClose={() => {}} />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  assert.ok(glossaryResearchHtml.includes('Technical explanation:'));
  assert.ok(glossaryResearchHtml.includes('Formula / Example:'));
  assert.ok(glossaryResearchHtml.includes('Copy formula'));
  assert.ok(glossaryResearchHtml.includes('n_components=3') || glossaryResearchHtml.includes('n_components = 3'));

  // 5. Role Pathways tab: all 4 roles and real navigation actions
  const pathwaysHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider value={makeLandingContext()}>
        <GuideModal open initialTab="pathways" onClose={() => {}} />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  for (const expected of [
    'Students',
    'Start in 3D Explorer',
    'General Users',
    'Try Vector Steering',
    'Researchers',
    'Open Evaluation Suite',
    'NLP Developers',
    'Inspect 384D Diffs',
  ]) {
    assert.ok(pathwaysHtml.includes(expected), `Role Pathways missing: ${expected}`);
  }

  // 6. Guided Sample Experiment stepper banner
  const guidedHtml = renderToStaticMarkup(
    <MemoryRouter>
      <StudioContext.Provider
        value={makeLandingContext({
          guidedExperiment: {
            active: true,
            step: 1,
            sampleText:
              'The software engineering team shipped a clean, reliable release ahead of schedule.',
            concept: 'formal_tone',
            strength: 0.75,
          },
        })}
      >
        <GuidedWalkthroughBanner />
      </StudioContext.Provider>
    </MemoryRouter>
  );
  assert.ok(guidedHtml.includes('Step 1 of 3'));
  assert.ok(guidedHtml.includes('Next: Apply Vector Steering'));

  console.log('ALL 6 GUIDE, GLOSSARY & LANDING PATHWAY TEST SUITES PASSED');
}

runGuideAndGlossaryTests();
