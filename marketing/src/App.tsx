import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { captureRef } from './lib/referral';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Properties from './pages/Properties';
import Handymen from './pages/Handymen';
import LegalTeam from './pages/LegalTeam';
import Signup from './pages/Signup';
import SignupCallback from './pages/SignupCallback';

const App: React.FC = () => {
  // Stash ?ref= from an affiliate link before any navigation drops the query string.
  React.useEffect(() => {
    captureRef();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfaf7]">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/:stateSlug" element={<Properties />} />
          <Route path="/handymen" element={<Handymen />} />
          <Route path="/handymen/:stateSlug" element={<Handymen />} />
          <Route path="/legal-team" element={<LegalTeam />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signup/callback" element={<SignupCallback />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

export default App;
