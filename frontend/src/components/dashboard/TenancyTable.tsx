import React from 'react';
import { Tenancy, LeaseStatus, LevyStatus, KycStatus } from '../../types';

interface TenancyTableProps {
  tenancies: Tenancy[];
}

const statusMap: Record<LeaseStatus, { text: string; color: string }> = {
  ACTIVE: { text: 'Active', color: 'bg-emerald-100 text-emerald-800' },
  PENDING: { text: 'Pending', color: 'bg-gray-100 text-gray-800' },
  OVERDUE: { text: 'Overdue Rent', color: 'bg-red-100 text-red-800' },
  TERMINATED: { text: 'Terminated', color: 'bg-amber-100 text-amber-900' },
};

const levyMap: Record<LevyStatus, { text: string; color: string }> = {
  CLEARED: { text: 'Cleared', color: 'text-emerald-700' },
  ARREARS: { text: 'Arrears', color: 'text-red-700 font-semibold' },
};

const kycMap: Record<KycStatus, { text: string; color: string }> = {
  VERIFIED: { text: 'NIN/BVN Verified', color: 'bg-emerald-100 text-emerald-800' },
  PENDING: { text: 'Verification Pending', color: 'bg-amber-100 text-amber-900' },
  FAILED: { text: 'Verification Failed', color: 'bg-red-100 text-red-800' },
};

const TenancyTable: React.FC<TenancyTableProps> = ({ tenancies }) => {
  const currencyFormatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  });

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Active Tenancies & Compliance</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-600 uppercase border-b border-gray-100">
            <tr>
              <th className="px-4 py-3">Property / Tenant</th>
              <th className="px-4 py-3">Lease Ends</th>
              <th className="px-4 py-3">Lease Status</th>
              <th className="px-4 py-3">KYC / Guarantor</th>
              <th className="px-4 py-3">Electricity Debt (DisCo)</th>
              <th className="px-4 py-3">Municipal Dues (Tenement/LAWMA)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenancies.map((tenancy) => (
              <tr key={tenancy.id} className="hover:bg-gray-50">
                <td className="px-4 py-4">
                  <div className="font-semibold text-gray-900 truncate max-w-xs">{tenancy.propertyTitle}</div>
                  <div className="text-xs text-gray-600">Tenant: {tenancy.tenantName}</div>
                </td>
                <td className="px-4 py-4 text-gray-700">
                  {new Date(tenancy.leaseEndDate).toLocaleDateString('en-GB')}
                </td>
                <td className="px-4 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusMap[tenancy.paymentStatus].color}`}>
                    {statusMap[tenancy.paymentStatus].text}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${kycMap[tenancy.kycStatus].color}`}>
                    {kycMap[tenancy.kycStatus].text}
                  </span>
                </td>
                <td className={`px-4 py-4 font-medium ${tenancy.discoArrears > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {currencyFormatter.format(tenancy.discoArrears)}
                </td>
                <td className={`px-4 py-4 font-medium ${levyMap[tenancy.lgLevyStatus].color}`}>
                  {levyMap[tenancy.lgLevyStatus].text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TenancyTable;
