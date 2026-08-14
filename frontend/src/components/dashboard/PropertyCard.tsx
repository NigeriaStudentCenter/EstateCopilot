import React from 'react';
import { Property } from '../../types';

interface PropertyCardProps {
  property: Property;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property }) => {
  const currencyFormatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
      {property.imageUrls?.[0] ? (
        <img src={property.imageUrls[0]} alt={property.title} className="w-full h-48 object-cover" />
      ) : (
        <div className="w-full h-48 bg-gradient-to-br from-emerald-700 to-emerald-950 flex items-center justify-center">
          <span className="text-white/80 text-sm font-medium">{property.lga}, {property.state}</span>
        </div>
      )}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span
            className={`px-3 py-1 text-xs font-semibold rounded-full ${
              property.propertyType === 'LONG_TERM' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {property.propertyType === 'LONG_TERM' ? 'Long-Term Lease' : 'Short-Let'}
          </span>
          <span className="text-sm font-medium text-gray-700">
            {currencyFormatter.format(property.rentAmount)}
            {property.propertyType === 'LONG_TERM' && '/yr'}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 truncate">{property.title}</h3>
        <p className="text-sm text-gray-600 truncate">{property.address}</p>
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100">
          <span>LGA: <span className="font-medium text-gray-800">{property.lga}</span></span>
          <span>State: <span className="font-medium text-gray-800">{property.state}</span></span>
        </div>
        {property.municipalId && (
          <div className="text-xs text-gray-400">Tenement ID: {property.municipalId}</div>
        )}
      </div>
    </div>
  );
};

export default PropertyCard;
