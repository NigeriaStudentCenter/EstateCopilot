import React from 'react';
import { Link } from 'react-router-dom';
import { LANDLORD_PORTAL_URL, TENANT_PORTAL_URL } from '../lib/links';

const Footer: React.FC = () => (
  <footer className="bg-emerald-950 text-emerald-100">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
      <div className="md:col-span-2">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 bg-white rounded-full"></div>
          <span className="text-lg font-bold text-white">EstateCopilot</span>
        </div>
        <p className="text-sm text-emerald-200 max-w-sm">
          Autonomous property management infrastructure for Nigerian landlords — verified tenants, rent that
          collects itself, and repairs handled by real local artisans. Lagos · Abuja · Port Harcourt.
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400 mb-3">Platform</p>
        <ul className="space-y-2 text-sm">
          <li><Link to="/" className="hover:text-white">How it works</Link></li>
          <li><Link to="/properties" className="hover:text-white">Vacant properties</Link></li>
          <li><Link to="/handymen" className="hover:text-white">Repair jobs for artisans</Link></li>
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400 mb-3">Sign in</p>
        <ul className="space-y-2 text-sm">
          <li><a href={LANDLORD_PORTAL_URL} className="hover:text-white">Landlord portal</a></li>
          <li><a href={TENANT_PORTAL_URL} className="hover:text-white">Tenant portal</a></li>
        </ul>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400 mb-3 mt-6">Guides</p>
        <ul className="space-y-2 text-sm">
          <li><a href="/guides/landlord-guide.html" className="hover:text-white">Landlord guide</a></li>
          <li><a href="/guides/tenant-guide.html" className="hover:text-white">Tenant guide</a></li>
          <li><a href="/guides/vacancies-repairs-guide.html" className="hover:text-white">Vacancies &amp; repairs</a></li>
        </ul>
      </div>
    </div>
    <div className="border-t border-emerald-900 py-5 text-center text-xs text-emerald-400">
      © {new Date().getFullYear()} EstateCopilot. Built in Nigeria, for Nigeria.
    </div>
  </footer>
);

export default Footer;
