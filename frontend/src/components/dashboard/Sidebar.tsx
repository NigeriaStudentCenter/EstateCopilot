import React from 'react';

const MARKETING_URL = import.meta.env.VITE_MARKETING_URL ?? 'http://localhost:5175';

export type NavView = 'Dashboard' | 'Properties' | 'Tenancies' | 'Tenant Vetting' | 'Finance & Levies' | 'Maintenance' | 'Legal' | 'Bookings' | 'AI Inbox' | 'Settings';

interface SidebarProps {
  active: NavView;
  onNavigate: (view: NavView) => void;
}

const links: { name: NavView; icon: string }[] = [
  { name: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m0 0l-7 7-7-7M19 10v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { name: 'Properties', icon: 'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z' },
  { name: 'Tenancies', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.732 4c-.76-.43-1.63-.68-2.582-.68-1.026 0-1.993.29-2.82.793' },
  { name: 'Tenant Vetting', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { name: 'Finance & Levies', icon: 'M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z' },
  { name: 'Maintenance', icon: 'M14.7 19.3l1.8-1.8c.4-.4.4-1.1 0-1.5l-4.5-4.5c-.4-.4-1.1-.4-1.5 0l-1.8 1.8c-.4.4-.4 1.1 0 1.5l4.5 4.5c.4.4 1.1.4 1.5 0zM20 11a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1zM6 12a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H6zm9.7-8.3l1.8 1.8c.4.4.4 1.1 0 1.5l-4.5 4.5c-.4.4-1.1.4-1.5 0L9.7 9.7c-.4-.4-.4-1.1 0-1.5l4.5-4.5c.4-.4 1.1-.4 1.5 0zM12 20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1zm0-10V8a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2zM4 6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H4z' },
  { name: 'Legal', icon: 'M12 3v2m0 0c-2.5 0-6 1-6 4l-2 5h4m4-9c2.5 0 6 1 6 4l2 5h-4m-8-9v14m-4 0h8M9 8l-3 6m9-6l3 6' },
  { name: 'Bookings', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { name: 'AI Inbox', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { name: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
];

const Sidebar: React.FC<SidebarProps> = ({ active, onNavigate }) => {
  return (
    <aside className="w-64 bg-emerald-950 text-white min-h-screen p-6 sticky top-0">
      <div className="mb-10 flex items-center gap-3">
        <div className="w-8 h-8 bg-white rounded-full"></div>
        <span className="text-xl font-bold">EstateCopilot</span>
      </div>
      <nav className="space-y-4">
        {links.map((link) => (
          <button
            key={link.name}
            onClick={() => onNavigate(link.name)}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-medium transition text-left ${
              active === link.name ? 'bg-emerald-800' : 'hover:bg-emerald-900'
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={link.icon} />
            </svg>
            {link.name}
          </button>
        ))}
      </nav>

      <div className="mt-10 pt-6 border-t border-emerald-900">
        <p className="px-4 text-xs font-semibold uppercase tracking-wide text-emerald-500 mb-2">Guides</p>
        <a
          href={`${MARKETING_URL}/guides/landlord-guide.html`}
          target="_blank"
          rel="noreferrer"
          className="block px-4 py-2 rounded-lg text-sm text-emerald-200 hover:bg-emerald-900 hover:text-white"
        >
          Landlord guide ↗
        </a>
        <a
          href={`${MARKETING_URL}/guides/vacancies-repairs-guide.html`}
          target="_blank"
          rel="noreferrer"
          className="block px-4 py-2 rounded-lg text-sm text-emerald-200 hover:bg-emerald-900 hover:text-white"
        >
          Vacancies &amp; repairs ↗
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
