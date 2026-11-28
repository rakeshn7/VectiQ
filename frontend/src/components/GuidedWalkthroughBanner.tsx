import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { useStudio } from '@/hooks/useStudio';

export const GuidedWalkthroughBanner: React.FC = () => {
  const navigate = useNavigate();
  const { guidedExperiment, setGuidedExperimentStep, exitGuidedExperiment } = useStudio();

  if (!guidedExperiment || !guidedExperiment.active) {
    return null;
  }

  const goToStep = (step: 1 | 2 | 3) => {
    setGuidedExperimentStep(step);
    if (step === 1) {
      navigate('/explorer', {
        state: {
          prefillText: guidedExperiment.sampleText,
          prefillConcept: guidedExperiment.concept,
          autoRunGuided: true,
        },
      });
    } else if (step === 2) {
      navigate('/steering', {
        state: {
          prefillText: guidedExperiment.sampleText,
          prefillConcept: guidedExperiment.concept,
          prefillStrength: guidedExperiment.strength,
          autoRunGuided: true,
        },
      });
    } else {
      navigate('/comparison');
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-brand-teal/40 bg-teal-50/60 px-4 sm:px-5 py-3.5 shadow-editorial-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="cyan">
              <Sparkles className="w-3 h-3" />
              Guided Sample Experiment &bull; Step {guidedExperiment.step} of 3
            </Badge>
            <span className="text-xs font-mono text-teal-900">
              {guidedExperiment.step === 1
                ? '1. Sentence Projection (Semantic Explorer)'
                : guidedExperiment.step === 2
                ? '2. Vector Steering (Formal Tone, λ = +0.75)'
                : '3. Side-by-Side Comparison (Comparison Lab)'}
            </span>
          </div>
          <p className="text-xs text-text-secondary">
            Sample sentence: &ldquo;{guidedExperiment.sampleText}&rdquo; — all embeddings, UMAP
            coordinates, nearest neighbors, and sentiment/emotion scores run live on the FastAPI
            backend.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {guidedExperiment.step === 1 && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => goToStep(2)}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Next: Apply Vector Steering
            </Button>
          )}
          {guidedExperiment.step === 2 && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => goToStep(3)}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Next: Inspect Comparison Diff
            </Button>
          )}
          {guidedExperiment.step === 3 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                exitGuidedExperiment();
                navigate('/evaluation');
              }}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Continue to Evaluation Suite
            </Button>
          )}
          <button
            type="button"
            onClick={exitGuidedExperiment}
            aria-label="Exit guided experiment"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background-surface px-2.5 py-1.5 text-xs text-text-secondary hover:text-brand-navy"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
