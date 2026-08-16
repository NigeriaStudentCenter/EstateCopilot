import React from 'react';

interface HeaderProps {
  landlordName: string;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ landlordName, onLogout }) => {
  const initials = landlordName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Landlord Portal</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">{landlordName}</div>
          <div className="w-10 h-10 rounded-full border border-gray-300 bg-emerald-700 text-white flex items-center justify-center text-sm font-semibold">
            {initials}
          </div>
          <button onClick={onLogout} className="text-sm text-gray-500 hover:text-gray-800">
            Log out
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
