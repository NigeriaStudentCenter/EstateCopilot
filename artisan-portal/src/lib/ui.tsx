import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-black/10 bg-white ${className}`}>{children}</div>;
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const styles =
    variant === 'primary'
      ? 'bg-ochre-500 text-white active:bg-ochre-600'
      : 'border border-black/15 text-[#42504a] active:bg-black/5';
  return (
    <button
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#6d7a73]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#8a948d]">{hint}</span>}
    </label>
  );
}

export const input =
  'w-full rounded-xl border border-black/15 px-3.5 py-3 text-[15px] outline-none focus:border-ochre-500 focus:ring-2 focus:ring-ochre-100';

export function Badge({ tier }: { tier: number }) {
  const map: Record<number, { t: string; c: string }> = {
    0: { t: 'Unverified', c: 'bg-black/5 text-[#6d7a73]' },
    1: { t: 'ID-verified', c: 'bg-moss-600/10 text-moss-700' },
    2: { t: 'Reference-checked', c: 'bg-moss-600/10 text-moss-700' },
    3: { t: 'EC-Certified', c: 'bg-ochre-100 text-ochre-700' },
  };
  const { t, c } = map[tier] ?? map[0];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c}`}>{t}</span>;
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-[90%] rounded-full bg-[#16241d] px-4 py-2 text-center text-sm font-medium text-white shadow-lg">
      {text}
    </div>
  );
}

export function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
