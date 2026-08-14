import React from 'react';

export type TenantView = 'Overview' | 'Correspondence' | 'Maintenance';

const links: TenantView[] = ['Overview', 'Correspondence', 'Maintenance'];

const Nav: React.FC<{ active: TenantView; onNavigate: (v: TenantView) => void; onLogout: () => void }> = ({
  active,
  onNavigate,
  onLogout,
}) => (
  <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-950 rounded-full"></div>
        <span className="text-lg font-bold text-gray-900">EstateCopilot</span>
      </div>
      <nav className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        {links.map((link) => (
          <button
            key={link}
            onClick={() => onNavigate(link)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
              active === link ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {link}
          </button>
        ))}
      </nav>
      <button onClick={onLogout} className="text-sm text-gray-500 hover:text-gray-800">
        Log out
      </button>
    </div>
  </header>
);

export default Nav;
