import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { RentInstallment, TenancyInfo } from '../types';

const currencyFormatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-gray-100 text-gray-800',
  OVERDUE: 'bg-red-100 text-red-800',
  TERMINATED: 'bg-amber-100 text-amber-900',
};

const kycStyles: Record<string, string> = {
  VERIFIED: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-amber-100 text-amber-900',
  FAILED: 'bg-red-100 text-red-800',
};

const OverviewPage: React.FC = () => {
  const [tenancy, setTenancy] = useState<TenancyInfo | null>(null);
  const [installments, setInstallments] = useState<RentInstallment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getMe(), api.getPaymentPlan()])
      .then(([me, plan]) => {
        setTenancy(me);
        setInstallments((plan.installments as RentInstallment[]) ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load your tenancy'));
  }, []);

  const nextDue = installments.find((i) => i.status === 'PENDING');
  const daysToLeaseEnd = tenancy ? Math.round((new Date(tenancy.leaseEndDate).getTime() - Date.now()) / 86400000) : null;

  if (error) return <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>;
  if (!tenancy) return <div className="text-sm text-gray-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Welcome, {tenancy.name.split(' ')[0]}</h2>
        <p className="text-sm text-gray-600 mt-1">{tenancy.propertyTitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Lease status</p>
          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[tenancy.paymentStatus]}`}>
            {tenancy.paymentStatus}
          </span>
          <p className="text-sm text-gray-600 mt-2">
            {daysToLeaseEnd !== null && daysToLeaseEnd >= 0
              ? `Renews in ${daysToLeaseEnd} days (${new Date(tenancy.leaseEndDate).toLocaleDateString('en-GB')})`
              : `Ended ${new Date(tenancy.leaseEndDate).toLocaleDateString('en-GB')}`}
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Verification</p>
          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${kycStyles[tenancy.kycStatus]}`}>
            {tenancy.kycStatus}
          </span>
          <p className="text-sm text-gray-600 mt-2">NIN/BVN + guarantor check</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Annual rent</p>
          <p className="text-lg font-bold text-gray-900">{currencyFormatter.format(tenancy.rentAmount)}</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Electricity balance</p>
          <p className={`text-lg font-bold ${tenancy.discoArrears > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {currencyFormatter.format(tenancy.discoArrears)}
          </p>
        </div>
      </div>

      {nextDue && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-xs text-amber-800 uppercase font-medium mb-1">Next payment due</p>
          <p className="text-lg font-bold text-amber-900">
            {currencyFormatter.format(nextDue.amount)} — due {new Date(nextDue.dueDate).toLocaleDateString('en-GB')}
          </p>
          <a
            href={nextDue.paymentLink}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2 text-sm font-medium bg-amber-900 text-white px-4 py-2 rounded-lg hover:bg-amber-800"
          >
            Pay now via Paystack
          </a>
        </div>
      )}
    </div>
  );
};

export default OverviewPage;
