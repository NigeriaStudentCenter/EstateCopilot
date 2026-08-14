import React from 'react';

const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-10 text-center">
    <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
    <p className="text-sm text-gray-500">Not built yet — say the word and this is next.</p>
  </div>
);

export default PlaceholderPage;
