import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SettingsPage } from '@/pages/SettingsPage';
import { WorklogsPage } from '@/pages/WorklogsPage';
import { TeamPage } from '@/pages/TeamPage';
import { RolesPage } from '@/pages/RolesPage';
import { BudgetDeltaPage } from '@/pages/BudgetDeltaPage';
import { Toaster } from '@/components/ui/toast';
import { useCredentials, useSelectedProject } from '@/hooks/useSettings';
import { useAppStore } from '@/store/appStore';

function AppInitializer() {
  const { data: credentials } = useCredentials();
  const { data: project } = useSelectedProject();
  const setCredentialsConfigured = useAppStore((s) => s.setCredentialsConfigured);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);

  useEffect(() => {
    if (credentials?.configured !== undefined) {
      setCredentialsConfigured(credentials.configured);
    }
  }, [credentials]);

  useEffect(() => {
    if (project?.projectId) {
      setSelectedProject({
        projectId: project.projectId,
        projectName: project.projectName,
        tempoId: project.tempoId,
        jiraProjectKey: project.jiraProjectKey,
      });
    }
  }, [project]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInitializer />
      <Layout>
        <Routes>
          <Route path="/" element={<WorklogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/budget-delta" element={<BudgetDeltaPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toaster />
    </BrowserRouter>
  );
}
