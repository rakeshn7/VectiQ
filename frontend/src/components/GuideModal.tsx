import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  Code2,
  Compass,
  Copy,
  GraduationCap,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import {
  filterGlossaryEntries,
  GLOSSARY_CATEGORIES,
  GLOSSARY_ENTRIES,
  type GlossaryCategoryId,
} from '@/data/glossaryData';
import { useStudio } from '@/hooks/useStudio';

export type GuideTabId = 'walkthrough' | 'glossary' | 'pathways';

export interface GuideModalProps {
  open: boolean;
  initialTab?: GuideTabId;
  onClose: () => void;
}

const WALKTHROUGH_CARDS = [
  {
    num: '1',
    title: 'Semantic Space',
    plain:
      'Every sentence becomes a 384D point. Sentences with related topics or tones naturally sit closer together.',
    researchDetail:
      'all-MiniLM-L6-v2 maps inputs (≤ 256 tokens) to unit-normalized float32 vectors on the 384D hypersphere (||E||₂ = 1.0).',
    icon: Sparkles,
  },
  {
    num: '2',
    title: 'Reading the 3D Map',
    plain:
      'UMAP projects 384 dimensions into 3D so you can orbit clusters. Distances in 3D are approximate visual guides, not exact cosine metrics.',
    researchDetail:
      'Fitted once with n_components=3, n_neighbors=15, min_dist=0.1, metric="cosine", random_state=42. 2D view uses the (x, y) slice of 3D UMAP.',
    icon: Compass,
  },
  {
    num: '3',
    title: 'Vector Steering',
    plain:
      "Using E' = normalize(E + α · D), steering shifts your sentence vector toward (+) or away from (−) a concept while α = 0 preserves E.",
    researchDetail:
      'D = normalize(mean(P) − mean(N)) is derived post-hoc for positive_sentiment, technical_tone, and formal_tone with α ∈ [-1.0, +1.0].',
    icon: SlidersHorizontal,
  },
  {
    num: '4',
    title: 'Compare & Evaluate',
    plain:
      'Comparison Lab inspects shifts side by side; Evaluation Dashboard sweeps α to check monotonicity, preservation, and neighbor stability.',
    researchDetail:
      'Audits Spearman ρ, R², Venna & Kaski continuity (2D & 3D), 2D-vs-3D overlap, Kruskal Stress-1, UMAP transform stability, and unit norms.',
    icon: BarChart3,
  },
];

export const GuideModal: React.FC<GuideModalProps> = ({
  open,
  initialTab = 'walkthrough',
  onClose,
}) => {
  const navigate = useNavigate();
  const { experienceMode, setExperienceMode, startGuidedExperiment } = useStudio();

  const [activeTab, setActiveTab] = useState<GuideTabId>(initialTab);
  const [glossaryQuery, setGlossaryQuery] = useState('');
  const [glossaryCategory, setGlossaryCategory] = useState<GlossaryCategoryId | 'all'>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [expandAllOverride, setExpandAllOverride] = useState<boolean | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const filteredGlossary = useMemo(
    () => filterGlossaryEntries(GLOSSARY_ENTRIES, glossaryQuery, glossaryCategory),
    [glossaryQuery, glossaryCategory]
  );

  if (!open) return null;

  const isEntryExpanded = (id: string): boolean => {
    if (id in expandedIds) return expandedIds[id];
    if (expandAllOverride !== null) return expandAllOverride;
    return experienceMode === 'research';
  };

  const toggleEntry = (id: string) => {
    const currentlyExpanded = isEntryExpanded(id);
    setExpandedIds((prev) => ({ ...prev, [id]: !currentlyExpanded }));
  };

  const toggleExpandAll = () => {
    const nextState = !(expandAllOverride ?? experienceMode === 'research');
    setExpandAllOverride(nextState);
    setExpandedIds({});
  };

  const handleCopyFormula = async (id: string, formula: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(formula);
        setCopiedId(id);
        setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
      }
    } catch {
      // Clipboard API unavailable in restricted environment
    }
  };

  const handleRunGuidedExperiment = () => {
    const state = startGuidedExperiment();
    onClose();
    navigate('/explorer', {
      state: {
        prefillText: state.sampleText,
        prefillConcept: state.concept,
        autoRunGuided: true,
      },
    });
  };

  const navigateViaPathway = (path: string) => {
    onClose();
    navigate(path);
  };

  const tabs: Array<{ id: GuideTabId; label: string }> = [
    { id: 'walkthrough', label: 'Quick Walkthrough' },
    { id: 'glossary', label: 'Parameter Glossary' },
    { id: 'pathways', label: 'Role Pathways' },
  ];

  const handleTabKeyDown = (event: React.KeyboardEvent, idx: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActiveTab(tabs[(idx + 1) % tabs.length].id);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/50 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vectiq-guide-title"
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-background-surface text-text-primary shadow-editorial-lg overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-border bg-background-surface flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg border border-border bg-background-secondary flex items-center justify-center text-brand-navy shrink-0">
              <BookOpen className="w-4 h-4 text-brand-teal" />
            </div>
            <h2
              id="vectiq-guide-title"
              className="text-base sm:text-lg font-semibold text-brand-navy tracking-tight truncate"
            >
              VectiQ Orientation &amp; Research Glossary
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              role="group"
              aria-label="Guide explanation mode"
              className="inline-flex rounded-lg border border-border bg-background-secondary p-0.5 text-[11px] font-medium"
            >
              <button
                type="button"
                onClick={() => setExperienceMode('simple')}
                aria-pressed={experienceMode === 'simple'}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  experienceMode === 'simple'
                    ? 'bg-brand-navy text-white shadow-sm'
                    : 'text-text-secondary hover:text-brand-navy'
                }`}
              >
                Simple Mode
              </button>
              <button
                type="button"
                onClick={() => setExperienceMode('research')}
                aria-pressed={experienceMode === 'research'}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  experienceMode === 'research'
                    ? 'bg-brand-teal text-white shadow-sm'
                    : 'text-text-secondary hover:text-brand-navy'
                }`}
              >
                Research Mode
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close guide"
              className="p-1.5 rounded-lg border border-border bg-background-surface text-text-secondary hover:text-brand-navy hover:border-brand-slate/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Tab Strip */}
        <div
          role="tablist"
          aria-label="Guide sections"
          className="px-5 sm:px-6 border-b border-border bg-background-secondary/50 flex items-center gap-2 overflow-x-auto"
        >
          {tabs.map((tab, idx) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                id={`guide-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`guide-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`relative px-3.5 py-3 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40 ${
                  selected
                    ? 'text-brand-navy font-semibold border-b-2 border-brand-navy'
                    : 'text-text-secondary hover:text-brand-navy border-b-2 border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5 bg-background/40">
          {/* TAB 1: QUICK WALKTHROUGH */}
          {activeTab === 'walkthrough' && (
            <div
              id="guide-panel-walkthrough"
              role="tabpanel"
              aria-labelledby="guide-tab-walkthrough"
              className="space-y-5"
            >
              <div className="rounded-xl border border-brand-navy/20 bg-background-surface p-4 sm:p-5 space-y-2 shadow-editorial-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider font-semibold text-brand-teal">
                    WHAT VECTIQ DOES (AND DOES NOT DO)
                  </div>
                  <Badge variant={experienceMode === 'research' ? 'violet' : 'cyan'}>
                    {experienceMode === 'research' ? 'Research View' : 'Simple View'}
                  </Badge>
                </div>
                <p className="text-sm text-text-primary leading-relaxed">
                  VectiQ transforms sentences into 384-dimensional numeric vectors using{' '}
                  <code className="font-mono text-xs bg-background-secondary px-1.5 py-0.5 rounded">
                    all-MiniLM-L6-v2
                  </code>
                  , steers those vectors along learned concept directions, and retrieves the closest
                  real sentences from a reference corpus. It does not use a generative LLM to
                  rewrite or invent new sentences.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {WALKTHROUGH_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.num}
                      className="rounded-xl border border-border bg-background-surface p-4 space-y-2.5 shadow-editorial-sm"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-brand-navy">
                          {card.num}. {card.title}
                        </h3>
                        <div className="w-8 h-8 rounded-lg bg-background-secondary border border-border flex items-center justify-center text-brand-teal shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                      </div>
                      <p className="text-xs sm:text-[13px] text-text-secondary leading-relaxed">
                        {card.plain}
                      </p>
                      {experienceMode === 'research' && (
                        <div className="pt-2 border-t border-border-subtle text-[11px] font-mono text-brand-navy leading-relaxed">
                          {card.researchDetail}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: PARAMETER GLOSSARY */}
          {activeTab === 'glossary' && (
            <div
              id="guide-panel-glossary"
              role="tabpanel"
              aria-labelledby="guide-tab-glossary"
              className="space-y-4"
            >
              {/* Search & Controls */}
              <div className="rounded-xl border border-border bg-background-surface p-4 space-y-3 shadow-editorial-sm">
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Search parameters, formulas, or workspaces…"
                      value={glossaryQuery}
                      onChange={(e) => setGlossaryQuery(e.target.value)}
                      leftIcon={<Search className="w-4 h-4" />}
                      aria-label="Search glossary entries"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {glossaryQuery && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setGlossaryQuery('')}
                      >
                        Clear search
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={toggleExpandAll}>
                      {(expandAllOverride ?? experienceMode === 'research')
                        ? 'Collapse Technical Details'
                        : 'Expand All Details'}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGlossaryCategory('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      glossaryCategory === 'all'
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-border bg-background-secondary/70 text-text-secondary hover:text-brand-navy'
                    }`}
                  >
                    All ({GLOSSARY_ENTRIES.length})
                  </button>
                  {GLOSSARY_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setGlossaryCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        glossaryCategory === cat.id
                          ? 'border-brand-teal bg-brand-teal text-white'
                          : 'border-border bg-background-secondary/70 text-text-secondary hover:text-brand-navy'
                      }`}
                    >
                      {cat.shortLabel}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted font-mono">
                  <span>
                    Showing {filteredGlossary.length} of {GLOSSARY_ENTRIES.length} documented
                    parameters
                  </span>
                  <span>
                    Active view:{' '}
                    {experienceMode === 'research'
                      ? 'Research Mode (expanded technical definitions & formulas)'
                      : 'Simple Mode (plain-English lead, expandable formulas)'}
                  </span>
                </div>
              </div>

              {/* Steering Core Equation Banner */}
              {(glossaryCategory === 'all' || glossaryCategory === 'steering') && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-xs text-teal-950 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="font-semibold">Canonical Steering Equation:</strong>{' '}
                    <code className="font-mono font-semibold">E&prime; = normalize(E + &alpha; &middot; D)</code>
                    <span className="ml-2 text-teal-900">
                      (&alpha; = 0 preserves E; &alpha; &gt; 0 moves toward +D; &alpha; &lt; 0 moves toward &minus;D)
                    </span>
                  </div>
                </div>
              )}

              {/* Glossary Cards */}
              {filteredGlossary.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background-surface p-8 text-center text-xs text-text-muted space-y-2">
                  <p>No glossary entries match &ldquo;{glossaryQuery}&rdquo;.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGlossaryQuery('');
                      setGlossaryCategory('all');
                    }}
                  >
                    Reset Glossary Filters
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredGlossary.map((entry) => {
                    const expanded = isEntryExpanded(entry.id);
                    const catLabel =
                      GLOSSARY_CATEGORIES.find((c) => c.id === entry.category)?.label ??
                      entry.category;
                    return (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-border bg-background-surface p-4 space-y-2.5 shadow-editorial-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-brand-navy">
                                {entry.parameterName}
                              </h3>
                              {entry.notImplemented && (
                                <Badge variant="amber">Not currently implemented</Badge>
                              )}
                            </div>
                            <span className="text-[10.5px] font-mono text-text-muted">
                              {catLabel}
                            </span>
                          </div>

                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => toggleEntry(entry.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background-secondary/70 px-2.5 py-1 text-[11px] font-medium text-brand-navy hover:border-brand-slate/60 transition-colors"
                          >
                            <span>{expanded ? 'Hide Technical Details' : 'Technical & Formula'}</span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                expanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>

                        <div className="text-xs text-text-secondary leading-relaxed">
                          <span className="font-semibold text-brand-navy">Simple explanation: </span>
                          {entry.simpleExplanation}
                        </div>

                        {expanded && (
                          <div className="pt-2.5 border-t border-border-subtle space-y-2 text-xs">
                            <div className="text-text-secondary leading-relaxed">
                              <span className="font-semibold text-brand-navy">
                                Technical explanation:{' '}
                              </span>
                              {entry.technicalExplanation}
                            </div>

                            <div className="rounded-lg border border-border-subtle bg-background px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[11px] font-mono text-brand-navy break-all">
                                <span className="font-sans font-semibold text-text-muted mr-1.5">
                                  Formula / Example:
                                </span>
                                {entry.formulaOrExample}
                              </div>
                              {entry.copyableFormula && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopyFormula(entry.id, entry.copyableFormula!)
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background-surface px-2 py-0.5 text-[10.5px] font-mono text-text-secondary hover:text-brand-navy transition-colors shrink-0"
                                >
                                  {copiedId === entry.id ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-700" />
                                      <span>Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy formula</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-text-muted">
                          <span className="font-medium text-text-secondary">Where used:</span>
                          {entry.whereUsed.map((loc) => (
                            <span
                              key={loc}
                              className="px-2 py-0.5 rounded-md bg-background-secondary border border-border-subtle text-[10.5px] font-mono text-brand-navy"
                            >
                              {loc}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ROLE PATHWAYS */}
          {activeTab === 'pathways' && (
            <div
              id="guide-panel-pathways"
              role="tabpanel"
              aria-labelledby="guide-tab-pathways"
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {/* Students */}
              <div className="rounded-xl border border-border bg-background-surface p-5 flex flex-col justify-between space-y-4 shadow-editorial-sm">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="cyan">Students</Badge>
                    <GraduationCap className="w-4 h-4 text-brand-teal" />
                  </div>
                  <p className="text-sm font-semibold text-brand-navy leading-snug">
                    Learn how AI converts words into coordinates step by step.
                  </p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Keep Simple Mode enabled and click points in different colors to see how related
                    sentences group together.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigateViaPathway('/explorer')}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  className="w-full"
                >
                  Start in 3D Explorer
                </Button>
              </div>

              {/* General Users */}
              <div className="rounded-xl border border-border bg-background-surface p-5 flex flex-col justify-between space-y-4 shadow-editorial-sm">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="emerald">General Users</Badge>
                    <Users className="w-4 h-4 text-emerald-700" />
                  </div>
                  <p className="text-sm font-semibold text-brand-navy leading-snug">
                    Test everyday sentences with plain-English readouts and minimal jargon.
                  </p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Pick a sample sentence, drag the slider between -1.0 and +1.0, and see which
                    real sentences sit closest.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigateViaPathway('/steering')}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  className="w-full"
                >
                  Try Vector Steering
                </Button>
              </div>

              {/* Researchers */}
              <div className="rounded-xl border border-border bg-background-surface p-5 flex flex-col justify-between space-y-4 shadow-editorial-sm">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="violet">Researchers</Badge>
                    <BarChart3 className="w-4 h-4 text-brand-navy" />
                  </div>
                  <p className="text-sm font-semibold text-brand-navy leading-snug">
                    Audit monotonicity, cosine decay, and UMAP projection trustworthiness.
                  </p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Switch to Research Mode in the top bar to reveal technical formulas, exact
                    angles, and metric limitations.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigateViaPathway('/evaluation')}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  className="w-full"
                >
                  Open Evaluation Suite
                </Button>
              </div>

              {/* NLP Developers */}
              <div className="rounded-xl border border-border bg-background-surface p-5 flex flex-col justify-between space-y-4 shadow-editorial-sm">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="neutral">NLP Developers</Badge>
                    <Code2 className="w-4 h-4 text-brand-slate" />
                  </div>
                  <p className="text-sm font-semibold text-brand-navy leading-snug">
                    Inspect 384D float32 components, model configuration, and API readiness.
                  </p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Compare original versus steered embedding dimensions in Comparison Lab and review
                    live parameters in System &amp; Corpus.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigateViaPathway('/comparison')}
                    rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                    className="flex-1"
                  >
                    Inspect 384D Diffs
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateViaPathway('/overview')}
                  >
                    System &amp; Corpus
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-border bg-background-surface flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            Skip guide for now
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleRunGuidedExperiment}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Run Guided Sample Experiment
          </Button>
        </div>
      </div>
    </div>
  );
};
