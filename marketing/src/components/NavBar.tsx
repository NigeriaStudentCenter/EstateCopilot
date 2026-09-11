import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LANDLORD_PORTAL_URL, TENANT_PORTAL_URL, PROPERTIES_MARKETPLACE_URL, MAIN_SITE_URL, isPropertiesHost } from '../lib/links';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition ${isActive ? 'text-emerald-700' : 'text-gray-600 hover:text-gray-900'}`;

// On the properties subdomain, "/" is the marketplace itself (see App.tsx) —
// so "Home" and the logo need to point at the real homepage explicitly
// instead of the usual internal "/".
const onPropertiesSubdomain = isPropertiesHost(window.location.hostname);

const NavBar: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-white/90 backdrop-blur border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {onPropertiesSubdomain ? (
          <a href={MAIN_SITE_URL} className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-950 rounded-full"></div>
            <span className="text-lg font-bold text-gray-900">EstateCopilot</span>
          </a>
        ) : (
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-950 rounded-full"></div>
            <span className="text-lg font-bold text-gray-900">EstateCopilot</span>
          </Link>
        )}

        <nav className="hidden md:flex items-center gap-8">
          {onPropertiesSubdomain ? (
            <a href={MAIN_SITE_URL} className="text-sm font-medium text-gray-600 hover:text-gray-900">Home</a>
          ) : (
            <NavLink to="/" end className={navLinkClass}>Home</NavLink>
          )}
          <a href={PROPERTIES_MARKETPLACE_URL} className="text-sm font-medium text-gray-600 hover:text-gray-900">Vacant Properties</a>
          <NavLink to="/artisans" className={navLinkClass}>Find an Artisan</NavLink>
          <NavLink to="/handymen" className={navLinkClass}>For Artisans</NavLink>
          <NavLink to="/legal-team" className={navLinkClass}>For Lawyers</NavLink>
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <a href={TENANT_PORTAL_URL} className="text-sm font-medium text-gray-600 hover:text-gray-900">Tenant login</a>
          <a href={LANDLORD_PORTAL_URL} className="text-sm font-medium text-gray-600 hover:text-gray-900">Landlord login</a>
          <Link
            to="/signup"
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm hover:bg-emerald-700 hover:shadow transition"
          >
            List your property
          </Link>
        </div>

        <button className="md:hidden text-gray-700" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-gray-100 px-4 py-4 space-y-3 bg-white">
          {onPropertiesSubdomain ? (
            <a href={MAIN_SITE_URL} className="block text-sm text-gray-600">Home</a>
          ) : (
            <NavLink to="/" end className={navLinkClass} onClick={() => setOpen(false)}>Home</NavLink>
          )}
          <a href={PROPERTIES_MARKETPLACE_URL} className="block text-sm text-gray-600">Vacant Properties</a>
          <NavLink to="/artisans" className="block" onClick={() => setOpen(false)}>Find an Artisan</NavLink>
          <NavLink to="/handymen" className="block" onClick={() => setOpen(false)}>For Artisans</NavLink>
          <NavLink to="/legal-team" className="block" onClick={() => setOpen(false)}>For Lawyers</NavLink>
          <a href={TENANT_PORTAL_URL} className="block text-sm text-gray-600">Tenant login</a>
          <a href={LANDLORD_PORTAL_URL} className="block text-sm text-gray-600">Landlord login</a>
          <Link to="/signup" onClick={() => setOpen(false)} className="block bg-emerald-600 text-white text-center px-4 py-2 rounded-lg text-sm font-semibold">
            List your property
          </Link>
        </div>
      )}
    </header>
  );
};

export default NavBar;
