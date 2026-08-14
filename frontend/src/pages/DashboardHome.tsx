import React from 'react';
import PropertyCard from '../components/dashboard/PropertyCard';
import TenancyTable from '../components/dashboard/TenancyTable';
import { DashboardStats, Property, Tenancy } from '../types';

// Mock Data - replace with calls to the backend API (see /backend)
const mockStats: DashboardStats = {
  totalRevenue: 34500000, // NGN 34.5M
  activeTenancies: 18,
  pendingRepairs: 3,
  municipalLeviesDue: 750000, // NGN 750k due across portfolio
  pendingVerifications: 2,
};

const mockProperties: Property[] = [
  { id: 'p1', title: 'Luxury 3-Bedroom Apartment', address: 'Plot 12, Admiralty Way, Lekki Phase 1', state: 'Lagos', lga: 'Eti-Osa', propertyType: 'LONG_TERM', rentAmount: 6500000, cautionDepositAmount: 500000, municipalId: 'ETI-OSA/2024/00931' },
  { id: 'p2', title: 'Studio Apartment', address: '18 Gana St, Maitama', state: 'FCT Abuja', lga: 'AMAC', propertyType: 'SHORT_LET', rentAmount: 75000, cautionDepositAmount: 150000, municipalId: 'AMAC/2024/04412' },
  { id: 'p3', title: 'Serviced Flat', address: 'Plot 4, Trans-Amadi Road', state: 'Rivers', lga: 'Port Harcourt', propertyType: 'LONG_TERM', rentAmount: 4800000, cautionDepositAmount: 300000, municipalId: 'PH/2024/01187' },
];

const mockTenancies: Tenancy[] = [
  { id: 't1', propertyTitle: 'Luxury 3-Bedroom Apartment (Unit A)', tenantName: 'Musa Bello', leaseEndDate: '2027-10-15', paymentStatus: 'ACTIVE', rentAmount: 6500000, discoArrears: 0, lgLevyStatus: 'CLEARED', kycStatus: 'VERIFIED' },
  { id: 't2', propertyTitle: 'Studio Apartment (VIP Access)', tenantName: 'Jennifer Adebayo', leaseEndDate: '2026-09-12', paymentStatus: 'ACTIVE', rentAmount: 75000, discoArrears: 35000, lgLevyStatus: 'CLEARED', kycStatus: 'VERIFIED' },
  { id: 't3', propertyTitle: 'Serviced Flat (Trans-Amadi)', tenantName: 'Chidi Okonkwo', leaseEndDate: '2026-08-20', paymentStatus: 'OVERDUE', rentAmount: 4800000, discoArrears: 12000, lgLevyStatus: 'ARREARS', kycStatus: 'PENDING' },
];

const currencyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

const DashboardHome: React.FC = () => {
  const statCards = [
    { name: 'Total Managed Revenue (Annual)', value: currencyFormatter.format(mockStats.totalRevenue), icon: '💰' },
    { name: 'Active Tenancies', value: mockStats.activeTenancies.toString(), icon: '🔑' },
    { name: 'Pending Repairs', value: mockStats.pendingRepairs.toString(), icon: '🛠️' },
    { name: 'Portfolio Municipal Arrears', value: currencyFormatter.format(mockStats.municipalLeviesDue), icon: '⚖️', isAlert: mockStats.municipalLeviesDue > 0 },
    { name: 'Pending KYC/Guarantor Checks', value: mockStats.pendingVerifications.toString(), icon: '🛡️', isAlert: mockStats.pendingVerifications > 0 },
  ];

  return (
    <div className="space-y-10">
      {/* Stats Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {statCards.map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="text-4xl">{stat.icon}</div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{stat.name}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.isAlert ? 'text-red-700' : 'text-gray-950'}`}>
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* Properties Grid */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Portfolio Overview</h2>
          <a href="#" className="text-emerald-700 font-medium text-sm hover:underline">View All Properties</a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {mockProperties.map((prop) => (
            <PropertyCard key={prop.id} property={prop} />
          ))}
        </div>
      </section>

      {/* Tenancy Table */}
      <section>
        <TenancyTable tenancies={mockTenancies} />
      </section>
    </div>
  );
};

export default DashboardHome;
