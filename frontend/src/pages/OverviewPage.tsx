import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Compass,
  Cpu,
  Database,
  GitCompareArrows,
  Layers,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Sparkles,
  Workflow,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorAlert,
  LoadingState,
  Reveal,
} from '@/components/ui';
import { useStudio } from '@/hooks/useStudio';
import { API_BASE_URL } from '@/services';
import { formatTimestamp } from '@/utils/format';

export const OverviewPage: React.FC = () => {
  const {
    connectionStatus,
    health,
    contractHealth,
    healthError,
    config,
    configError,
    isRefreshingStatus,
    lastCheckedAt,
    refreshBackendStatus,
  } = useStudio();

  const modules = [
    {
      to: '/explorer',
      title: 'Semantic Explorer',
      desc: 'Inspect dataset embeddings, filter topic clusters, and locate sentences in 2D or 3D space.',
      icon: Compass,
      accent: 'text-brand-slate',
    },
    {
      to: '/steering',
      title: 'Vector Steering',
      desc: 'Adjust concept strength smoothly from -1.0 to +1.0 and observe spatial movement.',
      icon: SlidersHorizontal,
      accent: 'text-brand-teal',
    },
    {
      to: '/comparison',
      title: 'Comparison Lab',
      desc: 'Compare original and steered embeddings, similarity retention, and neighbor rank shifts.',
      icon: GitCompareArrows,
      accent: 'text-brand-navy',
    },
    {
      to: '/evaluation',
      title: 'Evaluation Dashboard',
      desc: 'Run quantitative strength sweeps to measure monotonicity, linearity, and stability.',
      icon: BarChart3,
      accent: 'text-emerald-700',
    },
  ];

  const workflowSteps = [
    {
      step: '01',
      title: 'Enter Text',
      detail: 'Provide any sentence (up to 1,000 characters) in plain everyday English.',
    },
    {
      step: '02',
      title: 'Encode Meaning',
      detail: 'FastAPI encodes the sentence into a unit-normalized 384D embedding vector.',
    },
    {
      step: '03',
      title: 'Apply Steering',
      detail: 'Dial a learned concept axis up or down using strength λ ∈ [-1.0, +1.0].',
    },
    {
      step: '04',
      title: 'Compare Shifts',
      detail: 'Inspect coordinate movement, nearest reference sentences, and meaning retention.',
    },
    {
      step: '05',
      title: 'Evaluate Sweeps',
      detail: 'Verify consistent, monotonic behavior across the full steering spectrum.',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Studio Orientation Header */}
      <Reveal>
        <Card className="overflow-hidden border-border bg-gradient-to-br from-background-surface via-background-surface to-background-secondary/80">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="max-w-3xl space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="cyan">
                    <Sparkles className="w-3 h-3" />
                    Semantic Space Studio
                  </Badge>
                  <Badge variant="violet">Workspace Overview</Badge>
                </div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-brand-navy">
                  Explore. Steer. Understand.
                </h2>
                <p className="text-sm text-text-secondary leading-relaxed">
                  VectiQ lets you inspect how an AI language model organizes sentence meaning in
                  high-dimensional space—and steer that meaning along clear conceptual axes. All
                  384-dimensional vector algebra and UMAP projections execute directly on the
                  FastAPI backend defined in{' '}
                  <code className="font-mono text-xs text-brand-navy bg-background-secondary px-1.5 py-0.5 rounded">
                    contracts/api-contract.md
                  </code>
                  .
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <Link to="/steering">
                  <Button variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />}>
                    Launch Vector Steering
                  </Button>
                </Link>
                <Link to="/explorer">
                  <Button variant="secondary" leftIcon={<Compass className="w-4 h-4" />}>
                    Open Explorer
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </Reveal>

      {/* Plain-Language Conceptual Guide */}
      <Reveal delayMs={60}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-slate" />
                <CardTitle>What are Semantic Embeddings?</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-text-secondary leading-relaxed space-y-2.5">
              <p>
                An embedding maps a sentence (up to 256 wordpiece tokens) into a list of
                numbers—384 coordinates from the pretrained, frozen{' '}
                <code className="font-mono text-xs text-brand-navy bg-background-secondary px-1.5 py-0.5 rounded">
                  all-MiniLM-L6-v2
                </code>{' '}
                encoder—capturing semantic similarity beyond exact keyword matching.
              </p>
              <p className="text-text-muted text-xs leading-relaxed">
                Sentences with similar intent cluster together. A fixed UMAP projection translates
                those 384D vectors into a readable 2D/3D visual map preserving local neighborhoods,
                while all cosine scores and k-NN retrieval execute strictly in 384D.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-brand-teal" />
                <CardTitle>What is Vector Steering?</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-text-secondary leading-relaxed space-y-2.5">
              <p>
                VectiQ learns concept directions post-hoc from contrasting anchor groups and steers
                an embedding via{' '}
                <code className="font-mono text-xs text-brand-teal bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                  normalize(v₀ + λ · c)
                </code>
                .
              </p>
              <p className="text-text-muted text-xs leading-relaxed">
                Strength <code className="font-mono">0.0</code> serves as the exact unsteered
                control. Positive (<code className="font-mono">+λ</code>) and negative (
                <code className="font-mono">-λ</code>) values steer the embedding toward reference
                neighbors that serve as geometric proxies rather than generating rewritten prose.
              </p>
            </CardContent>
          </Card>
        </div>
      </Reveal>

      {/* Live Backend Health & Model Config */}
      <Reveal delayMs={90}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Backend Health Status */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-brand-slate" />
                  Backend Connection Status
                </CardTitle>
                <CardDescription>Live probe from GET /api/v1/health</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={isRefreshingStatus}
                onClick={() => void refreshBackendStatus()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {isRefreshingStatus && !health && !healthError ? (
                <LoadingState
                  title="Checking backend status…"
                  description={`Connecting to ${API_BASE_URL}`}
                />
              ) : healthError ? (
                <ErrorAlert error={healthError} onRetry={() => void refreshBackendStatus()} />
              ) : health ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge
                      variant={
                        connectionStatus === 'connected'
                          ? 'emerald'
                          : connectionStatus === 'partial'
                          ? 'amber'
                          : 'rose'
                      }
                    >
                      status: {health.status}
                    </Badge>
                    <span className="text-[11px] font-mono text-text-muted">
                      Checked: {formatTimestamp(lastCheckedAt)}
                    </span>
                  </div>

                  {contractHealth ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl border border-border bg-background/80 p-3.5">
                        <div className="text-text-muted">Model Loaded</div>
                        <div className="font-mono font-medium text-brand-navy mt-1">
                          {contractHealth.model_loaded ? 'Yes (Ready)' : 'No'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-background/80 p-3.5">
                        <div className="text-text-muted">UMAP Fitted</div>
                        <div className="font-mono font-medium text-brand-navy mt-1">
                          {contractHealth.umap_fitted ? 'Yes (Consistent)' : 'No'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-background/80 p-3.5">
                        <div className="text-text-muted">Corpus Size</div>
                        <div className="font-mono font-medium text-brand-navy mt-1">
                          {contractHealth.corpus_size} sentences
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-background/80 p-3.5">
                        <div className="text-text-muted">API Version</div>
                        <div className="font-mono font-medium text-brand-navy mt-1">
                          v{contractHealth.version}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1.5">
                      <div className="font-semibold">Backend Running in Initialization Stub Mode</div>
                      <p className="text-amber-800 leading-relaxed">
                        <code className="font-mono">/api/v1/health</code> responded with{' '}
                        <code className="font-mono">status=&quot;{health.status}&quot;</code>
                        {health.version ? ` (v${health.version})` : ''}. Full ML inference endpoints
                        (<code className="font-mono">/config</code>,{' '}
                        <code className="font-mono">/semantic-map</code>,{' '}
                        <code className="font-mono">/steer</code>,{' '}
                        <code className="font-mono">/evaluate</code>) are not yet exposed by the
                        backend server.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  title="No Backend Status Available"
                  description="Click Refresh to probe GET /api/v1/health."
                />
              )}
            </CardContent>
          </Card>

          {/* Backend Model & Projection Config */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-brand-teal" />
                  Model &amp; Projection Configuration
                </CardTitle>
                <CardDescription>Live metadata from GET /api/v1/config</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {isRefreshingStatus && !config && !configError ? (
                <LoadingState
                  title="Loading backend configuration…"
                  description="Fetching model parameters and steering concepts."
                />
              ) : config ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-border bg-background/80 p-3.5">
                      <div className="text-text-muted">Embedding Model</div>
                      <div
                        className="font-mono font-medium text-brand-navy mt-1 truncate"
                        title={config.model.name}
                      >
                        {config.model.name}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/80 p-3.5">
                      <div className="text-text-muted">Vector Dimensions</div>
                      <div className="font-mono font-medium text-brand-navy mt-1">
                        {config.model.dimensions}D ({config.model.normalized_embeddings ? 'L2-Norm' : 'Raw'})
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/80 p-3.5">
                      <div className="text-text-muted">Projection Engine</div>
                      <div className="font-mono font-medium text-brand-navy mt-1">
                        {config.projection.method} ({config.projection.dimensions}D •{' '}
                        {config.projection.metric})
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-background/80 p-3.5">
                      <div className="text-text-muted">Steering Bounds</div>
                      <div className="font-mono font-medium text-brand-navy mt-1">
                        [{config.steering.min_strength}, +{config.steering.max_strength}] (step{' '}
                        {config.steering.step})
                      </div>
                    </div>
                  </div>
                </div>
              ) : configError ? (
                <ErrorAlert
                  title="Configuration Endpoint Unavailable"
                  error={configError}
                  onRetry={() => void refreshBackendStatus()}
                />
              ) : (
                <EmptyState
                  icon={<Database className="w-5 h-5" />}
                  title="Configuration Not Loaded"
                  description="Waiting for GET /api/v1/config response."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </Reveal>

      {/* Available Semantic Concepts from Backend */}
      <Reveal delayMs={100}>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Available Semantic Concepts</CardTitle>
              <CardDescription>
                Interpretable concept axes exposed by GET /api/v1/config for vector steering
              </CardDescription>
            </div>
            {config && <Badge variant="emerald">{config.steering.concepts.length} Active Concepts</Badge>}
          </CardHeader>
          <CardContent>
            {config ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {config.steering.concepts.map((concept) => (
                  <div
                    key={concept.id}
                    className="rounded-xl border border-border bg-background/70 p-4 space-y-2.5 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-brand-navy">{concept.label}</span>
                        <Badge variant="violet">{concept.id}</Badge>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed">
                        {concept.description}
                      </p>
                    </div>
                    <div className="pt-2.5 border-t border-border-subtle flex items-center justify-between text-[11px] font-mono">
                      <span className="text-brand-slate">-1: {concept.negative_label}</span>
                      <span className="text-brand-teal font-medium">+1: {concept.positive_label}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Backend Concept Catalog Unavailable"
                description="Available semantic concepts will populate automatically once GET /api/v1/config returns model configuration from the FastAPI backend."
              />
            )}
          </CardContent>
        </Card>
      </Reveal>

      {/* 5-Step Workflow */}
      <Reveal delayMs={110}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-brand-slate" />
              <CardTitle>Experimentation Workflow</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {workflowSteps.map((item) => (
                <div
                  key={item.step}
                  className="rounded-xl border border-border bg-background/75 p-4 space-y-1.5"
                >
                  <span className="text-[11px] font-mono font-semibold text-brand-teal">
                    STEP {item.step}
                  </span>
                  <h4 className="text-xs font-semibold text-brand-navy">{item.title}</h4>
                  <p className="text-[11px] text-text-muted leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </Reveal>

      {/* Module Navigation Cards */}
      <Reveal delayMs={120}>
        <div>
          <h3 className="text-sm font-semibold text-brand-navy mb-3.5">Studio Modules</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {modules.map((mod) => {
              const Icon = mod.icon;
              return (
                <Link
                  key={mod.to}
                  to={mod.to}
                  className="group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40"
                >
                  <Card interactive className="h-full">
                    <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                      <div className="space-y-3">
                        <div className="w-9 h-9 rounded-xl bg-background-secondary border border-border flex items-center justify-center">
                          <Icon className={`w-4 h-4 ${mod.accent}`} />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-brand-navy group-hover:text-brand-teal transition-colors">
                            {mod.title}
                          </h4>
                          <p className="text-xs text-text-muted mt-1 leading-relaxed">{mod.desc}</p>
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy">
                        <span>Open module</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </Reveal>
    </div>
  );
};
