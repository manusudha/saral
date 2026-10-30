'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ResetAllButton() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  async function go() {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    await fetch('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'all' }) });
    setArmed(false);
    router.refresh();
  }
  return (
    <button onClick={go} className={`rounded-full border px-4 py-2 text-sm font-semibold ${armed ? 'border-red-300 bg-red-50 text-red-700' : 'border-line text-mute hover:text-navy'}`}>
      {armed ? 'Click again to delete all demo data' : 'Reset all demo data'}
    </button>
  );
}
