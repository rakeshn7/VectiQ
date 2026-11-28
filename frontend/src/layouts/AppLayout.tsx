import React, { useState } from 'react';
import { GuidedWalkthroughBanner } from '@/components/GuidedWalkthroughBanner';
import { Header, Sidebar } from '@/components/navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background text-text-primary">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Header onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-8 max-w-7xl w-full mx-auto">
          <GuidedWalkthroughBanner />
          <ErrorBoundary fallbackTitle="Page Rendering Error">{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
