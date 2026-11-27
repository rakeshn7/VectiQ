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
      desc: 'Inspect dataset embeddings, filter semantic clusters, and project sentences in space.',
      icon: Compass,
      accent: 'text-accent-cyan',
    },
    {
      to: '/steering',
      title: 'Vector Steering',
      desc: 'Apply continuous concept steering (-1.0 to +1.0) and inspect vector displacement.',
      icon: SlidersHorizontal,
      accent: 'text-accent-violet',
    },
    {
      to: '/comparison',
      title: 'Comparison Lab',
      desc: 'Compare original vs. steered coordinates, similarities, and neighbor shifts side by side.',
      icon: GitCompareArrows,
      accent: 'text-sky-300',
    },
    {
      to: '/evaluation',
      title: 'Evaluation Dashboard',
      desc: 'Measure monotonicity, semantic preservation, and neighbor stability across strengths.',
      icon: BarChart3,
      accent: 'text-accent-emerald',
    },
  ];

  const workflowSteps = [
    { step: '01', title: 'Enter Text', detail: 'Provide any natural language sentence up to 1,000 chars.' },
    { step: '02', title: 'Generate Embedding', detail: 'Backend encodes text into normalized 384D vectors.' },
    { step: '03', title: 'Apply Vector Steering', detail: 'Shift along concept axes with λ ∈ [-1.0, +1.0].' },
    { step: '04', title: 'Compare Results', detail: 'Inspect spatial movement, neighbors, and cosine drift.' },
    { step: '05', title: 'Evaluate Performance', detail: 'Sweep strengths for monotonicity & stability metrics.' },
  ];

  return (
    <div className="space-y-6">
      {/* Introduction Hero */}
      <Card className="overflow-hidden border-sky-500/20 bg-gradient-to-br from-background-surface/90 via-background-surface/80 to-indigo-950/30">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="cyan">
                  <Sparkles className="w-3 h-3" />
                  Semantic Space Studio
                </Badge>
                <Badge variant="violet">Vector Steering &amp; Visualizer</Badge>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
                Explore. Steer. Understand.
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                VectiQ is an interactive research interface for inspecting sentence embeddings and
                steering semantic meaning along interpretable concept directions. All embedding
                inference, 384-dimensional vector algebra, and UMAP projections execute strictly on
                the FastAPI backend defined in <code className="font-mono text-xs text-accent-cyan">contracts/api-contract.md</code>.
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

      {/* Concepts Explanation: Embeddings vs Vector Steering */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent-cyan" />
              <CardTitle>What are Semantic Embeddings?</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-xs sm:text-sm text-text-secondary leading-relaxed space-y-2">
            <p>
              Sentence embedding models encode text into dense, unit-normalized vectors in high-dimensional
              space (384 dimensions for <code className="font-mono text-xs text-accent-cyan">all-MiniLM-L6-v2</code>).
            </p>
            <p className="text-text-muted text-xs">
              Semantically related sentences cluster closely together under cosine similarity, while a
              pre-fitted UMAP projection maps those 384D neighborhoods into visual 2D/3D space without
              altering backend vector math.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-accent-violet" />
              <CardTitle>What is Vector Steering?</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-xs sm:text-sm text-text-secondary leading-relaxed space-y-2">
            <p>
              Vector steering adjusts a sentence&apos;s semantic representation directly in 384D embedding
              space by adding a scaled concept direction vector: <code className="font-mono text-xs text-purple-300">normalize(v₀ + λ · c)</code>.
            </p>
            <p className="text-text-muted text-xs">
              Positive steering (<code className="font-mono">+λ</code>) moves meaning toward the concept,
              zero (<code className="font-mono">0.0</code>) leaves the embedding unchanged, and negative
              steering (<code className="font-mono">-λ</code>) shifts toward the opposing semantic pole.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live Backend Health & Model Config */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Backend Health Status */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-4 h-4 text-accent-cyan" />
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
              <LoadingState title="Checking backend status…" description={`Connecting to ${API_BASE_URL}`} />
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
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="text-text-muted">Model Loaded</div>
                      <div className="font-mono text-text-primary mt-1">
                        {contractHealth.model_loaded ? 'Yes (Ready)' : 'No'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="text-text-muted">UMAP Fitted</div>
                      <div className="font-mono text-text-primary mt-1">
                        {contractHealth.umap_fitted ? 'Yes (Consistent)' : 'No'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="text-text-muted">Corpus Size</div>
                      <div className="font-mono text-text-primary mt-1">
                        {contractHealth.corpus_size} sentences
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="text-text-muted">API Version</div>
                      <div className="font-mono text-text-primary mt-1">
                        v{contractHealth.version}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200 space-y-1.5">
                    <div className="font-semibold">Backend Running in Initialization Stub Mode</div>
                    <p className="text-amber-200/80 leading-relaxed">
                      <code className="font-mono">/api/v1/health</code> responded with{' '}
                      <code className="font-mono">status=&quot;{health.status}&quot;</code>
                      {health.version ? ` (v${health.version})` : ''}. Full ML inference endpoints
                      (<code className="font-mono">/config</code>, <code className="font-mono">/semantic-map</code>,{' '}
                      <code className="font-mono">/steer</code>, <code className="font-mono">/evaluate</code>) are not yet
                      exposed by the backend server.
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
                <Cpu className="w-4 h-4 text-accent-violet" />
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
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-text-muted">Embedding Model</div>
                    <div className="font-mono text-accent-cyan mt-1 truncate" title={config.model.name}>
                      {config.model.name}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-text-muted">Vector Dimensions</div>
                    <div className="font-mono text-text-primary mt-1">
                      {config.model.dimensions}D ({config.model.normalized_embeddings ? 'L2-Norm' : 'Raw'})
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-text-muted">Projection Engine</div>
                    <div className="font-mono text-text-primary mt-1">
                      {config.projection.method} ({config.projection.dimensions}D • {config.projection.metric})
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/60 p-3">
                    <div className="text-text-muted">Steering Bounds</div>
                    <div className="font-mono text-text-primary mt-1">
                      [{config.steering.min_strength}, +{config.steering.max_strength}] (step {config.steering.step})
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

      {/* Available Semantic Concepts from Backend */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Available Semantic Concepts</CardTitle>
            <CardDescription>
              Concept directions exposed by GET /api/v1/config for vector steering
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
                  className="rounded-xl border border-border bg-background/60 p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-primary">{concept.label}</span>
                    <Badge variant="violet">{concept.id}</Badge>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">{concept.description}</p>
                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-accent-cyan">-1: {concept.negative_label}</span>
                    <span className="text-purple-300">+1: {concept.positive_label}</span>
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

      {/* 5-Step Workflow */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4 text-accent-cyan" />
            <CardTitle>Experimentation Workflow</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {workflowSteps.map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-border/80 bg-background/60 p-3.5 space-y-1.5"
              >
                <span className="text-[11px] font-mono font-semibold text-accent-cyan">
                  STEP {item.step}
                </span>
                <h4 className="text-xs font-semibold text-text-primary">{item.title}</h4>
                <p className="text-[11px] text-text-muted leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Module Navigation Cards */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Studio Modules</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.to}
                to={mod.to}
                className="group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50"
              >
                <Card interactive className="h-full">
                  <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                    <div className="space-y-3">
                      <div className="w-9 h-9 rounded-lg bg-background-elevated border border-border flex items-center justify-center">
                        <Icon className={`w-4 h-4 ${mod.accent}`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary group-hover:text-accent-cyan transition-colors">
                          {mod.title}
                        </h4>
                        <p className="text-xs text-text-muted mt-1 leading-relaxed">{mod.desc}</p>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-1 text-xs font-medium text-accent-cyan">
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
    </div>
  );
};
