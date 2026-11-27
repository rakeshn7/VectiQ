import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { StudioProvider } from '@/context/StudioContext';
import { AppLayout } from '@/layouts/AppLayout';
import {
  ComparisonLabPage,
  EvaluationDashboardPage,
  OverviewPage,
  SemanticExplorerPage,
  VectorSteeringPage,
} from '@/pages';

export const App: React.FC = () => {
  return (
    <StudioProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/explorer" element={<SemanticExplorerPage />} />
          <Route path="/steering" element={<VectorSteeringPage />} />
          <Route path="/comparison" element={<ComparisonLabPage />} />
          <Route path="/evaluation" element={<EvaluationDashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </StudioProvider>
  );
};

export default App;
