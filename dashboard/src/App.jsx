/**
 * LOCKON VOIGHT — Proctor Dashboard App
 * Root component with routing and providers.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import theme from './theme/theme';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';
import LoginPage from './pages/Login';
import SetupPage from './pages/Setup';
import Dashboard from './pages/Dashboard';
import CompetitionView from './pages/CompetitionView';
import CompetitionsList from './pages/CompetitionsList';
import ContestantDetail from './pages/ContestantDetail';
import IncidentsPage from './pages/Incidents';
import SettingsPage from './pages/Settings';
import FleetCommandPage from './pages/FleetCommand';
import DetectionPolicyPage from './pages/DetectionPolicy';
import UserManagementPage from './pages/UserManagement';
import AgentDownloadPage from './pages/AgentDownload';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/" /> : <LoginPage />
      } />
      <Route path="/setup" element={
        isAuthenticated ? <Navigate to="/" /> : <SetupPage />
      } />

      <Route path="/" element={
        <ProtectedRoute><Layout /></ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        <Route path="competitions" element={<CompetitionsList />} />
        <Route path="competitions/:id" element={<CompetitionView />} />
        <Route path="contestants/:id" element={<ContestantDetail />} />
        <Route path="incidents" element={<IncidentsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="fleet" element={<FleetCommandPage />} />
        <Route path="policy" element={<DetectionPolicyPage />} />
        <Route path="users" element={<UserManagementPage />} />
      </Route>

      {/* Public route — no login required */}
      <Route path="/download" element={<AgentDownloadPage />} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Toaster 
        position="bottom-right" 
        toastOptions={{
          style: {
            background: '#1a1d21',
            color: '#e2e8f0',
            border: '1px solid #334155',
            fontFamily: 'monospace',
            borderRadius: 0,
            fontSize: '0.8rem',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#000' } },
          error: { iconTheme: { primary: '#f43f5e', secondary: '#000' } },
        }}
      />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
