'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ResetAllButton() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    try {
      const response = await fetch('/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'all' }) });
      if (!response.ok) throw new Error('Could not reset your data. Please try again.');
      setError('');
      setArmed(false);
      router.refresh();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
    <button onClick={go} className={`rounded-full border px-4 py-2 text-sm font-semibold ${armed ? 'border-red-300 bg-red-50 text-red-700' : 'border-line text-mute hover:text-navy'}`}>
      {armed ? 'Click again to delete all demo data' : 'Reset all demo data'}
    </button>
    {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
    </>
  );
}
