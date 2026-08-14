import React from 'react';
import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Properties from './pages/Properties';
import Handymen from './pages/Handymen';
import Signup from './pages/Signup';
import SignupCallback from './pages/SignupCallback';

const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#fbfaf7]">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/handymen" element={<Handymen />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signup/callback" element={<SignupCallback />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

export default App;
