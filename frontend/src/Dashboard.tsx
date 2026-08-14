import React, { useState } from 'react';
import Sidebar, { NavView } from './components/dashboard/Sidebar';
import Header from './components/dashboard/Header';
import DashboardHome from './pages/DashboardHome';
import MaintenancePage from './pages/MaintenancePage';
import TenanciesPage from './pages/TenanciesPage';
import AiInboxPage from './pages/AiInboxPage';
import PropertiesPage from './pages/PropertiesPage';
import BookingsPage from './pages/BookingsPage';
import SettingsPage from './pages/SettingsPage';
import PlaceholderPage from './pages/PlaceholderPage';

interface DashboardProps {
  landlord: { name: string; email: string; subscriptionStatus: string };
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ landlord, onLogout }) => {
  const [view, setView] = useState<NavView>('Dashboard');

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar active={view} onNavigate={setView} />
      <div className="flex-1">
        <Header landlordName={landlord.name} onLogout={onLogout} />
        <main className="max-w-7xl mx-auto p-6 md:p-8">
          {view === 'Dashboard' && <DashboardHome />}
          {view === 'Tenancies' && <TenanciesPage />}
          {view === 'Maintenance' && <MaintenancePage />}
          {view === 'AI Inbox' && <AiInboxPage />}
          {view === 'Properties' && <PropertiesPage />}
          {view === 'Bookings' && <BookingsPage />}
          {view === 'Tenant Vetting' && <PlaceholderPage title="Tenant Vetting" />}
          {view === 'Finance & Levies' && <PlaceholderPage title="Finance & Levies" />}
          {view === 'Settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
