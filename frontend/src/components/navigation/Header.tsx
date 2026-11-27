import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Cpu, ExternalLink, Menu } from 'lucide-react';
import { NAV_ITEMS } from '@/components/navigation/Sidebar';
import { Badge } from '@/components/ui';
import { useStudio } from '@/hooks/useStudio';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu }) => {
  const location = useLocation();
  const { config, connectionStatus } = useStudio();

  const currentNav =
    NAV_ITEMS.find((item) => location.pathname.startsWith(item.to)) ?? NAV_ITEMS[0];

  const modelBadge = config
    ? `${config.model.name} • ${config.model.dimensions}D`
    : 'all-MiniLM-L6-v2 • 384D';

  const statusBadgeVariant =
    connectionStatus === 'connected'
      ? 'emerald'
      : connectionStatus === 'partial'
      ? 'amber'
      : connectionStatus === 'checking'
      ? 'blue'
      : 'rose';

  const statusText =
    connectionStatus === 'connected'
      ? 'API Ready'
      : connectionStatus === 'partial'
      ? 'API Partial'
      : connectionStatus === 'checking'
      ? 'Checking API'
      : 'API Offline';

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 h-16">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="lg:hidden p-2 rounded-xl border border-border bg-background-surface text-text-secondary hover:text-brand-navy shadow-editorial-sm"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-brand-navy tracking-tight truncate">
              {currentNav.label}
            </h1>
            <p className="text-xs text-text-muted truncate hidden sm:block">
              {currentNav.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-background-surface text-xs text-text-secondary hover:text-brand-navy hover:border-brand-slate/50 transition-colors"
          >
            <span>Home</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <Badge variant="neutral" className="hidden md:inline-flex">
            <Cpu className="w-3 h-3 text-brand-slate" />
            <span>{modelBadge}</span>
          </Badge>
          <Badge variant={statusBadgeVariant}>{statusText}</Badge>
        </div>
      </div>
    </header>
  );
};
