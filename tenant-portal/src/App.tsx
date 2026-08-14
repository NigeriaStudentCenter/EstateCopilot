import React, { useState } from 'react';
import { clearToken, isAuthed } from './lib/api';
import AuthPage from './pages/AuthPage';
import Nav, { TenantView } from './components/Nav';
import OverviewPage from './pages/OverviewPage';
import CorrespondencePage from './pages/CorrespondencePage';
import MaintenancePage from './pages/MaintenancePage';

const App: React.FC = () => {
  const [authed, setAuthed] = useState(isAuthed());
  const [view, setView] = useState<TenantView>('Overview');

  function handleLogout() {
    clearToken();
    setAuthed(false);
  }

  if (!authed) {
    return <AuthPage onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav active={view} onNavigate={setView} onLogout={handleLogout} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {view === 'Overview' && <OverviewPage />}
        {view === 'Correspondence' && <CorrespondencePage />}
        {view === 'Maintenance' && <MaintenancePage />}
      </main>
    </div>
  );
};

export default App;
