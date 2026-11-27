import React from 'react';
import { 
  Sparkles, 
  Layers, 
  SlidersHorizontal, 
  Network, 
  Terminal, 
  CheckCircle2, 
  Server,
  Atom,
  BarChart3
} from 'lucide-react';

export const App: React.FC = () => {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  const stackComponents = [
    { name: 'React 18 & TypeScript', desc: 'Type-safe component architecture', icon: Atom, status: 'Active' },
    { name: 'Vite 6', desc: 'Next-generation frontend tooling', icon: Sparkles, status: 'Active' },
    { name: 'Tailwind CSS', desc: 'Utility-first dark design foundation', icon: Layers, status: 'Active' },
    { name: 'Plotly.js & Canvas', desc: '3D high-dimensional visualization ready', icon: Network, status: 'Ready' },
    { name: 'Axios Client', desc: 'Configured API service layer', icon: Server, status: 'Configured' },
    { name: 'Recharts & Lucide', desc: 'Evaluation charts and iconography', icon: BarChart3, status: 'Ready' },
  ];

  const plannedModules = [
    { title: 'Semantic Explorer', icon: Network, status: 'Pending Backend Contract' },
    { title: 'Vector Steering Lab', icon: SlidersHorizontal, status: 'Pending Backend Contract' },
    { title: 'Comparison Lab', icon: Layers, status: 'Pending Backend Contract' },
    { title: 'Evaluation Dashboard', icon: BarChart3, status: 'Pending Backend Contract' },
  ];

  return (
    <div className="min-h-screen flex flex-col justify-between px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto">
      {/* Top Header */}
      <header className="flex items-center justify-between pb-6 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-accent-cyan/20 to-accent-violet/20 border border-border flex items-center justify-center shadow-glow-cyan/20">
            <Atom className="w-5 h-5 text-accent-cyan" />
          </div>
          <div>
            <span className="font-mono text-xs uppercase tracking-wider text-accent-cyan font-semibold">Semantic Space Studio</span>
            <p className="text-xs text-text-muted">Research & Engineering Lab</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20">
            <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse"></span>
            Environment Ready
          </span>
        </div>
      </header>

      {/* Hero Welcome Section */}
      <main className="py-12 md:py-16 flex-1 flex flex-col justify-center">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-background-surface border border-border text-xs font-mono text-accent-cyan mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Frontend Architecture Initialized</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-text-primary">
            Semantic Space Studio
          </h1>

          <p className="mt-4 text-xl sm:text-2xl font-light text-accent-cyan/90 tracking-wide">
            Explore. Steer. Understand.
          </p>

          <p className="mt-6 text-base text-text-secondary leading-relaxed max-w-2xl">
            An AI-powered semantic space visualizer and vector steering environment. 
            This frontend workspace has been initialized with React, TypeScript, Tailwind CSS, 
            Plotly.js, and an Axios client foundation, awaiting backend contract finalization.
          </p>
        </div>

        {/* Environment Status Grid */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stackComponents.map((item) => {
            const Icon = item.icon;
            return (
              <div 
                key={item.name}
                className="p-4 rounded-xl bg-background-surface/80 border border-border hover:border-accent-cyan/40 transition-all duration-200 group"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-background-elevated border border-border flex items-center justify-center text-accent-cyan group-hover:text-white group-hover:bg-accent-cyan/20 transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-accent-emerald">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {item.status}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-text-primary">{item.name}</h3>
                <p className="text-xs text-text-muted mt-1">{item.desc}</p>
              </div>
            );
          })}
        </div>

        {/* API & Module Status Cards */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* API Gateway Card */}
          <div className="p-5 rounded-xl bg-background-surface/60 border border-border col-span-1">
            <div className="flex items-center gap-2 mb-3 text-text-primary">
              <Server className="w-4 h-4 text-accent-cyan" />
              <h3 className="text-sm font-semibold">API Service Foundation</h3>
            </div>
            <div className="p-3 rounded-lg bg-background font-mono text-xs text-text-secondary border border-border/80 break-all">
              <div className="text-[11px] text-text-muted mb-1">Target Endpoint:</div>
              <span className="text-accent-cyan">{apiBaseUrl}</span>
            </div>
            <p className="text-xs text-text-muted mt-3">
              Configured via <code className="text-accent-violet">VITE_API_BASE_URL</code> in <code className="text-text-secondary">.env</code>. Ready for contract endpoints.
            </p>
          </div>

          {/* Next Phase Modules */}
          <div className="p-5 rounded-xl bg-background-surface/60 border border-border lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-text-primary">
                <Terminal className="w-4 h-4 text-accent-violet" />
                <h3 className="text-sm font-semibold">Upcoming Feature Modules</h3>
              </div>
              <span className="text-[11px] font-mono text-text-muted">Awaiting Phase 2</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {plannedModules.map((mod) => {
                const ModIcon = mod.icon;
                return (
                  <div key={mod.title} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-background/60 border border-border/60">
                    <ModIcon className="w-4 h-4 text-text-muted" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text-secondary truncate">{mod.title}</div>
                      <div className="text-[10px] text-text-muted truncate">{mod.status}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-muted font-mono">
        <div>
          <span>VectiQ / Semantic Space Studio &bull; Frontend Initialized</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Branch: <code className="text-accent-cyan">feature/react-frontend</code></span>
        </div>
      </footer>
    </div>
  );
};

export default App;
