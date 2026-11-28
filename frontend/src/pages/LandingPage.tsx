import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Atom,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Compass,
  Cpu,
  GitCompareArrows,
  Layers,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { GuideModal, type GuideTabId } from '@/components/GuideModal';
import { LandingVectorGraphic } from '@/components/LandingVectorGraphic';
import { Badge, Button, Card, CardContent, Reveal } from '@/components/ui';
import { useGentleParallax } from '@/hooks/useScrollReveal';
import { useStudio } from '@/hooks/useStudio';
import { CONTRACT_CONCEPTS } from '@/utils/format';

export interface LandingPageProps {
  initialGuideOpen?: boolean;
  initialGuideTab?: GuideTabId;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  initialGuideOpen = false,
  initialGuideTab = 'walkthrough',
}) => {
  const { connectionStatus, contractHealth, config, experienceMode, setExperienceMode } =
    useStudio();
  const parallaxY = useGentleParallax(0.045, 20);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(initialGuideOpen);
  const [guideTab, setGuideTab] = useState<GuideTabId>(initialGuideTab);

  const openGuideModal = (tab: GuideTabId = 'walkthrough') => {
    setGuideTab(tab);
    setGuideOpen(true);
    setMobileMenuOpen(false);
  };

  const concepts = config?.steering.concepts ?? CONTRACT_CONCEPTS;
  const modelName = config?.model.name ?? 'all-MiniLM-L6-v2';
  const dimensions = config?.model.dimensions ?? 384;
  const corpusSize = contractHealth?.corpus_size ?? 360;

  const statusBadge =
    connectionStatus === 'connected'
      ? { variant: 'emerald' as const, label: 'Model Online' }
      : connectionStatus === 'partial'
      ? { variant: 'amber' as const, label: 'Model Partial' }
      : connectionStatus === 'checking'
      ? { variant: 'blue' as const, label: 'Checking Model' }
      : { variant: 'neutral' as const, label: 'API Offline' };

  const workspaceModules = [
    {
      to: '/overview',
      title: 'Overview',
      eyebrow: '01 • Diagnostics',
      summary:
        'Check live backend readiness, inspect active model settings, and browse available semantic concept axes.',
      icon: LayoutDashboard,
    },
    {
      to: '/explorer',
      title: 'Semantic Explorer',
      eyebrow: '02 • 3D Corpus Map',
      summary:
        'Navigate 360 curated sentences in 2D or 3D UMAP space, filter topic clusters, or project your own sentence.',
      icon: Compass,
    },
    {
      to: '/steering',
      title: 'Vector Steering',
      eyebrow: '03 • Concept Control',
      summary:
        'Apply smooth steering strength (-1.0 to +1.0) along sentiment, technical tone, or formality and watch neighbors shift.',
      icon: SlidersHorizontal,
    },
    {
      to: '/comparison',
      title: 'Comparison Lab',
      eyebrow: '04 • Side-by-Side Diff',
      summary:
        'Contrast original and steered embeddings, coordinate displacement, cosine retention, and top-K rank changes.',
      icon: GitCompareArrows,
    },
    {
      to: '/evaluation',
      title: 'Evaluation Dashboard',
      eyebrow: '05 • Quantitative Sweep',
      summary:
        'Measure monotonicity (Spearman ρ), linearity (R²), neighbor Jaccard stability, and UMAP trustworthiness.',
      icon: BarChart3,
    },
  ];

  const howItWorks = [
    {
      step: '01',
      title: 'Sentence to Geometry',
      plain:
        'A frozen pretrained sentence-embedding model converts full sentence meaning into 384 unit-normalized numbers—a coordinate in semantic space.',
      technical: `${modelName} (pretrained) • L2-normalized ${dimensions}D vector`,
      icon: Layers,
    },
    {
      step: '02',
      title: 'Post-Hoc Contrastive Steering',
      plain:
        'Using contrasting reference examples (like casual vs. formal writing), VectiQ learns an interpretable direction vector post-hoc that you can dial up or down without retraining weights.',
      technical: 'v′ = normalize(v₀ + λ · c), λ ∈ [-1.0, +1.0]',
      icon: SlidersHorizontal,
    },
    {
      step: '03',
      title: 'Visual Verification',
      plain:
        'Every calculation happens in full 384D space first, then projects onto a single consistent 3D map so movement reflects genuine semantic change.',
      technical: 'Fixed fitted 3D UMAP projection & cosine k-NN',
      icon: Compass,
    },
  ];

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col">
      {/* Editorial Top Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-2.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40 rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-navy text-white flex items-center justify-center shadow-editorial-sm">
              <Atom className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-tight text-brand-navy">VectiQ</span>
              <span className="hidden xl:inline text-xs text-text-muted">
                Semantic Space Studio
              </span>
            </div>
          </Link>

          <nav
            aria-label="Landing Navigation"
            className="hidden lg:flex items-center gap-5 text-xs font-medium text-text-secondary whitespace-nowrap"
          >
            <Link to="/overview" className="hover:text-brand-navy transition-colors">
              Overview
            </Link>
            <a href="#modules" className="hover:text-brand-navy transition-colors">
              Workspaces
            </a>
            <a href="#how-it-works" className="hover:text-brand-navy transition-colors">
              Methodology
            </a>
            <button
              type="button"
              onClick={() => openGuideModal('pathways')}
              className="hover:text-brand-navy transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40 rounded"
            >
              Who It&rsquo;s For
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {/* Simple / Research Mode Selector */}
            <div
              role="group"
              aria-label="Reading mode selector"
              className="hidden sm:inline-flex rounded-lg border border-border bg-background-surface p-0.5 text-[11px] font-medium"
            >
              <button
                type="button"
                onClick={() => setExperienceMode('simple')}
                aria-pressed={experienceMode === 'simple'}
                className={`px-2 py-1 rounded-md transition-colors ${
                  experienceMode === 'simple'
                    ? 'bg-brand-navy text-white'
                    : 'text-text-secondary hover:text-brand-navy'
                }`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => setExperienceMode('research')}
                aria-pressed={experienceMode === 'research'}
                className={`px-2 py-1 rounded-md transition-colors ${
                  experienceMode === 'research'
                    ? 'bg-brand-teal text-white'
                    : 'text-text-secondary hover:text-brand-navy'
                }`}
              >
                Research
              </button>
            </div>

            {/* Always-Visible Guide Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openGuideModal('walkthrough')}
              leftIcon={<BookOpen className="w-3.5 h-3.5 text-brand-teal" />}
              className="bg-background-surface border-border text-brand-navy hover:border-brand-slate/70"
            >
              Guide
            </Button>

            <Badge variant={statusBadge.variant} className="hidden md:inline-flex whitespace-nowrap">
              {statusBadge.label}
            </Badge>

            <Link to="/steering" className="hidden sm:inline-flex">
              <Button size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Open Studio
              </Button>
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              className="lg:hidden p-2 rounded-lg border border-border bg-background-surface text-brand-navy"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Panel */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-border bg-background-surface px-5 py-4 space-y-3">
            <div className="flex flex-col space-y-2 text-sm text-text-secondary">
              <Link
                to="/overview"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 hover:text-brand-navy"
              >
                Overview
              </Link>
              <a
                href="#modules"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 hover:text-brand-navy"
              >
                Workspaces
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 hover:text-brand-navy"
              >
                Methodology
              </a>
              <button
                type="button"
                onClick={() => openGuideModal('pathways')}
                className="py-1.5 text-left hover:text-brand-navy"
              >
                Who It&rsquo;s For
              </button>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border-subtle">
                <span className="text-xs text-text-muted font-medium">Mode</span>
                <div className="inline-flex rounded-lg border border-border bg-background-secondary p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setExperienceMode('simple')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      experienceMode === 'simple'
                        ? 'bg-brand-navy text-white'
                        : 'text-text-secondary'
                    }`}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => setExperienceMode('research')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      experienceMode === 'research'
                        ? 'bg-brand-teal text-white'
                        : 'text-text-secondary'
                    }`}
                  >
                    Research
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2">
                <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                <Link
                  to="/steering"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                    Open Studio
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <GuideModal
        open={guideOpen}
        initialTab={guideTab}
        onClose={() => setGuideOpen(false)}
      />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-14 pb-16 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-6 space-y-6 animate-hero-in">
              <span className="editorial-eyebrow">
                <Cpu className="w-3.5 h-3.5 text-brand-teal" />
                Embedding Analysis &amp; Contrastive Steering
              </span>

              <h1 className="text-3xl sm:text-4xl lg:text-[3rem] font-semibold tracking-tight text-brand-navy leading-[1.12]">
                See how AI maps meaning—and steer it with precision.
              </h1>

              <p className="text-base text-text-secondary leading-relaxed max-w-xl">
                VectiQ projects plain sentences into high-dimensional meaning coordinates using a
                pretrained encoder. Explore semantic clusters, apply post-hoc directional steering
                along interpretable axes, inspect nearest reference proxies, and audit alignment
                against unsteered baselines.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link to="/steering">
                  <Button size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>
                    Launch Vector Steering
                  </Button>
                </Link>
                <Link to="/explorer">
                  <Button variant="secondary" size="lg" leftIcon={<Compass className="w-4 h-4" />}>
                    Explore 3D Space
                  </Button>
                </Link>
                <Link
                  to="/overview"
                  className="text-xs font-medium text-brand-slate hover:text-brand-navy underline underline-offset-4 px-2 py-2"
                >
                  Inspect Studio Overview
                </Link>
              </div>
            </div>

            <div
              className="lg:col-span-6 animate-hero-in"
              style={{
                animationDelay: '90ms',
                transform: `translateY(${parallaxY}px)`,
                transition: 'transform 120ms ease-out',
              }}
            >
              <LandingVectorGraphic />
            </div>
          </div>
        </section>

        {/* Grounded Telemetry Ribbon */}
        <section className="border-y border-border bg-background-secondary/70">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-6">
            <Reveal>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
                    Embedding Model
                  </div>
                  <div className="mt-1 text-sm sm:text-base font-semibold font-mono text-brand-navy">
                    {modelName}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
                    Vector Space
                  </div>
                  <div className="mt-1 text-sm sm:text-base font-semibold font-mono text-brand-navy">
                    {dimensions} Dimensions
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
                    Reference Corpus
                  </div>
                  <div className="mt-1 text-sm sm:text-base font-semibold font-mono text-brand-navy">
                    {corpusSize} Sentences
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
                    Live Backend Status
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm sm:text-base font-semibold text-brand-teal">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {connectionStatus === 'connected'
                        ? 'Model & UMAP Ready'
                        : connectionStatus === 'checking'
                        ? 'Connecting to API…'
                        : 'Backend Required for Live Inference'}
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* How It Works (Plain-English Narrative) */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
          <Reveal className="max-w-2xl space-y-3 mb-12">
            <span className="editorial-eyebrow">Methodology</span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-brand-navy">
              From sentence to vector, without the black box.
            </h2>
            <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
              Modern AI models read text as geometry. VectiQ opens up that coordinate system so
              both researchers and non-technical visitors can inspect how tone and meaning behave.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {howItWorks.map((item, idx) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.step} delayMs={idx * 70}>
                  <Card className="h-full">
                    <CardContent className="p-6 flex flex-col justify-between h-full space-y-5">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="w-10 h-10 rounded-xl bg-background-secondary border border-border flex items-center justify-center text-brand-navy">
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="font-mono text-xs font-semibold text-brand-slate">
                            STEP {item.step}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-brand-navy">{item.title}</h3>
                        <p className="text-sm text-text-secondary leading-relaxed">{item.plain}</p>
                      </div>
                      <div className="pt-3 border-t border-border-subtle text-[11px] font-mono text-text-muted">
                        {item.technical}
                      </div>
                    </CardContent>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Concept Directions */}
        <section id="concepts" className="border-y border-border bg-background-secondary/50 py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <Reveal className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
              <div className="max-w-2xl space-y-2.5">
                <span className="editorial-eyebrow">Interpretable Concept Axes</span>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-brand-navy">
                  Three calibrated directions you can dial continuously.
                </h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Each axis is derived on the backend from contrastive anchor sentences in the
                  corpus—letting you nudge any input text toward either pole.
                </p>
              </div>
              <Link to="/steering">
                <Button variant="secondary" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                  Test Concepts Live
                </Button>
              </Link>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {concepts.map((concept, idx) => (
                <Reveal key={concept.id} delayMs={idx * 70}>
                  <Card interactive className="h-full">
                    <CardContent className="p-6 space-y-4 flex flex-col justify-between h-full">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-semibold text-brand-navy">{concept.label}</h3>
                          <Badge variant="violet">{concept.id}</Badge>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed">
                          {concept.description}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-border-subtle flex items-center justify-between text-[11px] font-mono">
                        <span className="text-brand-slate">-1.0 {concept.negative_label}</span>
                        <span className="text-brand-teal font-medium">+1.0 {concept.positive_label}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Studio Modules */}
        <section id="modules" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 lg:py-24">
          <Reveal className="max-w-2xl space-y-3 mb-12">
            <span className="editorial-eyebrow">Interactive Workspace</span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-brand-navy">
              Five specialized views connected to one live engine.
            </h2>
            <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
              Move smoothly from high-level exploration to single-sentence steering, side-by-side
              comparison, and quantitative evaluation.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {workspaceModules.map((mod, idx) => {
              const Icon = mod.icon;
              return (
                <Reveal key={mod.to} delayMs={idx * 55}>
                  <Link
                    to={mod.to}
                    className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40"
                  >
                    <Card interactive className="h-full">
                      <CardContent className="p-6 flex flex-col justify-between h-full space-y-5">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="w-10 h-10 rounded-xl bg-background-secondary border border-border flex items-center justify-center text-brand-navy group-hover:bg-brand-navy group-hover:text-white transition-colors">
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-[11px] font-mono text-text-muted">
                              {mod.eyebrow}
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-brand-navy group-hover:text-brand-teal transition-colors">
                            {mod.title}
                          </h3>
                          <p className="text-sm text-text-secondary leading-relaxed">
                            {mod.summary}
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-navy">
                          <span>Open module</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* Scientific Grounding Guarantee */}
        <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-20">
          <Reveal>
            <div className="rounded-2xl border border-border bg-background-surface p-8 sm:p-10 shadow-editorial-md grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8 space-y-3">
                <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.12em] text-brand-teal font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  Methodological Integrity
                </div>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-brand-navy">
                  Zero client-side guesswork. Every metric is computed in 384D space.
                </h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Visualization tools often distort distances when reducing hundreds of dimensions
                  down to three. VectiQ performs all steering algebra, cosine preservation checks, and
                  nearest-neighbor search on the exact normalized 384D vectors on the FastAPI server,
                  projecting through one fixed UMAP transform solely for visual inspection.
                </p>
              </div>
              <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3">
                <Link to="/evaluation" className="w-full">
                  <Button variant="primary" className="w-full" rightIcon={<ArrowRight className="w-4 h-4" />}>
                    Open Evaluation Suite
                  </Button>
                </Link>
                <Link to="/overview" className="w-full">
                  <Button variant="secondary" className="w-full">
                    Inspect System Status
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Clean Research Footer */}
      <footer className="border-t border-border bg-background-secondary/60 py-8">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-brand-navy">VectiQ</span>
            <span>&bull;</span>
            <span>Semantic Space Studio ({modelName}, {dimensions}D)</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Link to="/overview" className="hover:text-brand-navy transition-colors">
              Overview
            </Link>
            <Link to="/explorer" className="hover:text-brand-navy transition-colors">
              Explorer
            </Link>
            <Link to="/steering" className="hover:text-brand-navy transition-colors">
              Steering
            </Link>
            <Link to="/comparison" className="hover:text-brand-navy transition-colors">
              Comparison
            </Link>
            <Link to="/evaluation" className="hover:text-brand-navy transition-colors">
              Evaluation
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
