import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Atom,
  BarChart3,
  Compass,
  GitCompareArrows,
  Home,
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
    to: '/overview',
    label: 'Overview',
    description: 'System status & concepts',
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
      dot: 'bg-brand-slate animate-pulse',
      text: 'Checking API…',
      badge: 'text-brand-slate border-slate-200 bg-slate-50',
    },
    connected: {
      dot: 'bg-emerald-600',
      text: 'Backend Connected',
      badge: 'text-emerald-800 border-emerald-200 bg-emerald-50',
    },
    partial: {
      dot: 'bg-amber-600',
      text: 'Partial API (Init Mode)',
      badge: 'text-amber-800 border-amber-200 bg-amber-50',
    },
    offline: {
      dot: 'bg-rose-600',
      text: 'Backend Offline',
      badge: 'text-rose-800 border-rose-200 bg-rose-50',
    },
  }[connectionStatus];

  const sidebarContent = (
    <div className="flex h-full flex-col bg-background-surface border-r border-border">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-border-subtle">
        <NavLink
          to="/"
          onClick={onCloseMobile}
          className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40 rounded-xl"
        >
          <div className="w-9 h-9 rounded-xl bg-brand-navy text-white flex items-center justify-center shadow-editorial-sm group-hover:bg-brand-navyHover transition-colors">
            <Atom className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight text-brand-navy">VectiQ</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background-secondary text-brand-slate border border-border">
                Studio
              </span>
            </div>
            <p className="text-[11px] text-text-muted leading-none mt-1">Semantic Research UI</p>
          </div>
        </NavLink>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-text-muted hover:text-brand-navy hover:bg-background-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Navigation */}
      <nav aria-label="Primary Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <div>
          <div className="px-3 pb-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-text-muted">
            Introduction
          </div>
          <NavLink
            to="/"
            end
            onClick={onCloseMobile}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-xl border transition-all duration-150 group',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40',
                isActive
                  ? 'bg-background-secondary border-border text-brand-navy font-medium'
                  : 'border-transparent text-text-secondary hover:text-brand-navy hover:bg-background-secondary/60'
              )
            }
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center border border-border bg-background-surface text-brand-slate shrink-0">
              <Home className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-medium">Landing Page</span>
          </NavLink>
        </div>

        <div className="space-y-1">
          <div className="px-3 pb-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-text-muted">
            Workspace Modules
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150 group',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40',
                    isActive
                      ? 'bg-brand-navy text-white border-brand-navy shadow-editorial-sm'
                      : 'border-transparent text-text-secondary hover:text-brand-navy hover:bg-background-secondary/75'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 transition-colors',
                        isActive
                          ? 'bg-white/15 border-white/20 text-white'
                          : 'bg-background-secondary border-border text-brand-slate group-hover:text-brand-navy'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{item.label}</div>
                      <div
                        className={cn(
                          'text-[11px] truncate',
                          isActive ? 'text-slate-200' : 'text-text-muted'
                        )}
                      >
                        {item.description}
                      </div>
                    </div>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Backend Status Footer */}
      <div className="p-4 border-t border-border-subtle bg-background/60">
        <div className="rounded-xl border border-border bg-background-surface p-3 space-y-2 shadow-editorial-sm">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono',
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
              className="p-1.5 rounded-lg text-text-muted hover:text-brand-navy hover:bg-background-secondary disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-slate/40"
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
            className="fixed inset-0 bg-brand-navy/30 backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10 shadow-editorial-lg">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
