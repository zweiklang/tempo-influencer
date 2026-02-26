import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SettingsPage } from '@/pages/SettingsPage';
import { WorklogsPage } from '@/pages/WorklogsPage';
import { TeamPage } from '@/pages/TeamPage';
import { RolesPage } from '@/pages/RolesPage';
import { BudgetDeltaPage } from '@/pages/BudgetDeltaPage';
import { Toaster } from '@/components/ui/toast';

export default function App() {
  return (
    <BrowserRouter>
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
