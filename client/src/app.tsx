import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';

import { WorkspaceProvider } from './WorkspaceContext';
import { AppLayout } from './components/Layout';
import { ConsultingPage } from './pages/ConsultingPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevelopmentPage } from './pages/DevelopmentPage';
import { DietPage } from './pages/DietPage';
import { FitnessPage } from './pages/FitnessPage';
import { MediaPage } from './pages/MediaPage';
import { ReadingPage } from './pages/ReadingPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import { MetacognitionPage } from './pages/MetacognitionPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false }, mutations: { retry: 0 } },
});

const RoutesComponent = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="metacognition" element={<MetacognitionPage />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="development" element={<DevelopmentPage />} />
            <Route path="consulting" element={<ConsultingPage />} />
            <Route path="fitness" element={<FitnessPage />} />
            <Route path="diet" element={<DietPage />} />
            <Route path="reading" element={<ReadingPage />} />
            <Route path="entertainment" element={<Navigate to="/reading" replace />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WorkspaceProvider>
    </QueryClientProvider>
  );
};

export default RoutesComponent;
