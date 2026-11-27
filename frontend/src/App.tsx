import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { StudioProvider } from '@/context/StudioContext';
import { AppLayout } from '@/layouts/AppLayout';
import {
  ComparisonLabPage,
  EvaluationDashboardPage,
  LandingPage,
  OverviewPage,
  SemanticExplorerPage,
  VectorSteeringPage,
} from '@/pages';

export const App: React.FC = () => {
  return (
    <StudioProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/overview"
          element={
            <AppLayout>
              <OverviewPage />
            </AppLayout>
          }
        />
        <Route
          path="/explorer"
          element={
            <AppLayout>
              <SemanticExplorerPage />
            </AppLayout>
          }
        />
        <Route
          path="/steering"
          element={
            <AppLayout>
              <VectorSteeringPage />
            </AppLayout>
          }
        />
        <Route
          path="/comparison"
          element={
            <AppLayout>
              <ComparisonLabPage />
            </AppLayout>
          }
        />
        <Route
          path="/evaluation"
          element={
            <AppLayout>
              <EvaluationDashboardPage />
            </AppLayout>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </StudioProvider>
  );
};

export default App;
