import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Atom,
  BarChart3,
  Compass,
  GitCompareArrows,
  LayoutDashboard,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useStudio } from '@/hooks/useStudio';
import { API_BASE_URL } from '@/services';
import { cn } from '@/utils/cn';

export interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Overview',
    description: 'Studio status & architecture',
    icon: LayoutDashboard,
  },
  {
    to: '/explorer',
    label: 'Semantic Explorer',
    description: 'Browse corpus & space map',
    icon: Compass,
  },
  {
    to: '/steering',
    label: 'Vector Steering',
    description: 'Adjust concept strength',
    icon: SlidersHorizontal,
  },
  {
    to: '/comparison',
    label: 'Comparison Lab',
    description: 'Original vs. steered diff',
    icon: GitCompareArrows,
  },
  {
    to: '/evaluation',
    label: 'Evaluation Dashboard',
    description: 'Monotonicity & preservation',
    icon: BarChart3,
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const { connectionStatus, isRefreshingStatus, refreshBackendStatus } = useStudio();

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  const statusConfig = {
    checking: {
      dot: 'bg-sky-400 animate-pulse',
      text: 'Checking API…',
      badge: 'text-sky-300 border-sky-500/30 bg-sky-500/10',
    },
    connected: {
      dot: 'bg-emerald-400',
      text: 'Backend Connected',
      badge: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    },
    partial: {
      dot: 'bg-amber-400',
      text: 'Partial API (Init Mode)',
      badge: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    },
    offline: {
      dot: 'bg-rose-400',
      text: 'Backend Offline',
      badge: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
    },
  }[connectionStatus];

  const sidebarContent = (
    <div className="flex h-full flex-col bg-background-secondary/95 border-r border-border backdrop-blur-md">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-border/80">
        <NavLink
          to="/"
          onClick={onCloseMobile}
          className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50 rounded-lg"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500/20 to-violet-500/25 border border-sky-500/30 flex items-center justify-center shadow-glow-cyan/20 group-hover:border-accent-cyan/60 transition-colors">
            <Atom className="w-5 h-5 text-accent-cyan" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-tight text-text-primary">VectiQ</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background-elevated text-accent-cyan border border-border">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-text-muted leading-none mt-1">Semantic Space Studio</p>
          </div>
        </NavLink>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-background-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Navigation */}
      <nav aria-label="Primary Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-text-muted">
          Workspace Modules
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150 group',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50',
                  isActive
                    ? 'bg-gradient-to-r from-sky-500/15 to-violet-500/10 border-sky-500/35 text-text-primary shadow-sm'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-background-surface/70'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 transition-colors',
                      isActive
                        ? 'bg-sky-500/20 border-sky-400/40 text-accent-cyan'
                        : 'bg-background-surface border-border/80 text-text-muted group-hover:text-text-secondary'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{item.label}</div>
                    <div className="text-[11px] text-text-muted truncate">{item.description}</div>
                  </div>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Backend Status Footer */}
      <div className="p-4 border-t border-border/80 bg-background/40">
        <div className="rounded-xl border border-border bg-background-surface/70 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-mono',
                statusConfig.badge
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full', statusConfig.dot)} />
              {statusConfig.text}
            </span>
            <button
              type="button"
              onClick={() => void refreshBackendStatus()}
              disabled={isRefreshingStatus}
              title="Refresh backend connection"
              aria-label="Refresh backend connection"
              className="p-1 rounded-md text-text-muted hover:text-accent-cyan hover:bg-background-elevated disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isRefreshingStatus && 'animate-spin')} />
            </button>
          </div>
          <div className="text-[10px] font-mono text-text-muted truncate" title={API_BASE_URL}>
            API: <span className="text-text-secondary">{API_BASE_URL}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block lg:w-64 xl:w-72 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation Menu"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">{sidebarContent}</aside>
        </div>
      )}
    </>
  );
};
