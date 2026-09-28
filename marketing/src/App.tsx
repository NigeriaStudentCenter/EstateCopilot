import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { captureRef } from './lib/referral';
import { isPropertiesHost } from './lib/links';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Properties from './pages/Properties';
import Handymen from './pages/Handymen';
import Artisans from './pages/Artisans';
import ArtisanProfile from './pages/ArtisanProfile';
import LegalTeam from './pages/LegalTeam';
import Signup from './pages/Signup';
import SignupCallback from './pages/SignupCallback';
import Agents, { AgentAuth } from './pages/Agents';
import AgentDashboard from './pages/AgentDashboard';
import AgentDealConfirm from './pages/AgentDealConfirm';
import { captureAgentCode } from './lib/agent';

// Same build deployed to two Static Web Apps: the main marketing site, and
// properties.estatecopilot.org — the property marketplace's own subdomain.
// Everything else about the app is identical; only what "/" renders differs.
const isOnPropertiesSubdomain = isPropertiesHost(window.location.hostname);

const App: React.FC = () => {
  // Stash ?ref= from an affiliate link before any navigation drops the query string.
  // New page = start at the top (the router keeps the old scroll position).
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  React.useEffect(() => {
    captureRef();
    captureAgentCode(); // ?agent=CODE from an agent's share link
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfaf7]">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={isOnPropertiesSubdomain ? <Properties /> : <Home />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/stays" element={<Properties staysMode />} />
          <Route path="/properties/:stateSlug" element={<Properties />} />
          <Route path="/handymen" element={<Handymen />} />
          <Route path="/handymen/:stateSlug" element={<Handymen />} />
          <Route path="/artisans" element={<Artisans />} />
          <Route path="/artisans/:stateSlug" element={<Artisans />} />
          <Route path="/artisan/:id" element={<ArtisanProfile />} />
          <Route path="/legal-team" element={<LegalTeam />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signup/callback" element={<SignupCallback />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/join" element={<AgentAuth mode="join" />} />
          <Route path="/agents/login" element={<AgentAuth mode="login" />} />
          <Route path="/agents/dashboard" element={<AgentDashboard />} />
          <Route path="/agents/deal/:token" element={<AgentDealConfirm />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

export default App;
