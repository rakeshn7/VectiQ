import React from 'react';
import { useLocation } from 'react-router-dom';
import { Cpu, Menu } from 'lucide-react';
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
    NAV_ITEMS.find((item) =>
      item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
    ) ?? NAV_ITEMS[0];

  const modelBadge = config
    ? `${config.model.name} • ${config.model.dimensions}D`
    : 'Contract: all-MiniLM-L6-v2 • 384D';

  const statusBadgeVariant =
    connectionStatus === 'connected'
      ? 'emerald'
      : connectionStatus === 'partial'
      ? 'amber'
      : connectionStatus === 'checking'
      ? 'cyan'
      : 'rose';

  const statusText =
    connectionStatus === 'connected'
      ? 'API Ready'
      : connectionStatus === 'partial'
      ? 'API Partial'
      : connectionStatus === 'checking'
      ? 'Probing API'
      : 'API Offline';

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 h-16">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Open navigation menu"
            className="lg:hidden p-2 rounded-lg border border-border bg-background-surface text-text-secondary hover:text-text-primary"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-text-primary truncate">
              {currentNav.label}
            </h1>
            <p className="text-xs text-text-muted truncate hidden sm:block">
              {currentNav.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Badge variant="neutral" className="hidden md:inline-flex">
            <Cpu className="w-3 h-3 text-accent-cyan" />
            <span>{modelBadge}</span>
          </Badge>
          <Badge variant={statusBadgeVariant}>{statusText}</Badge>
        </div>
      </div>
    </header>
  );
};
