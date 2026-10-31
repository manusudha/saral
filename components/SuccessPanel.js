'use client';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { inr } from '@/lib/format';

export default function SuccessPanel() {
  const { result, journey } = useSelector((s) => s.journey);
  if (!result) return null;
  return (
    <div className="rounded-3xl border border-line bg-white p-8 shadow-sm">
      <div className="flex flex-wrap items-center gap-5">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-ok text-3xl font-bold text-white">✓</div>
        <div>
          <h2 className="text-3xl font-extrabold text-ink">{result.headline}</h2>
          <div className="mt-1 text-mute">Reference <span className="font-mono font-bold text-navy">{result.id}</span> · {result.status}</div>
        </div>
        <div className="ml-auto rounded-2xl bg-navy px-6 py-4 text-white">
          <div className="text-sm text-sky-100">{result.amountLabel}</div>
          <div className="text-3xl font-extrabold">{inr(result.amount)}</div>
        </div>
      </div>

      {result.disclaimer && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">{result.disclaimer}</p>}
      <p className="mt-5 text-xs text-mute">Steps marked <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">simulated</span> are a demo — no insurer or lender is connected yet.</p>
      <ol className="relative mt-4 space-y-6 border-l-2 border-line pl-6">
        {result.timeline.map((t) => (
          <li key={t.label} className="relative">
            <span className={`absolute -left-[33px] top-0.5 grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
              t.state === 'done' ? 'bg-ok text-white' : t.state === 'current' ? 'border-4 border-sky bg-white' : 'border-2 border-slate-300 bg-white'
            }`}>{t.state === 'done' ? '✓' : ''}</span>
            <div className={`font-bold ${t.state === 'todo' ? 'text-mute' : 'text-ink'}`}>{t.label}{t.simulated && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-mute">simulated</span>}</div>
            <div className="text-sm text-mute">{t.detail}</div>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        {journey === 'health_claim' ? (
          <Link href="/journey/loan_precheck" className="rounded-full bg-sky px-5 py-3 text-sm font-bold text-white hover:bg-navy">Try a loan eligibility check</Link>
        ) : (
          <Link href="/journey/health_claim" className="rounded-full bg-sky px-5 py-3 text-sm font-bold text-white hover:bg-navy">File a health claim</Link>
        )}
        {result.saved && (
          <Link href={`/submissions/${result.id}`} className="rounded-full border border-navy px-5 py-3 text-sm font-bold text-navy hover:bg-sky-50">View audit record</Link>
        )}
        <Link href="/" className="rounded-full border border-line px-5 py-3 text-sm font-semibold text-mute hover:text-navy">Home</Link>
        <span className="ml-auto text-xs text-mute">
          {result.saved ? 'Saved to database ✓ · ' : ''}Workflow: {result.n8n?.sent ? 'sent to n8n ✓' : `n8n not called (${result.n8n?.reason || result.n8n?.status || 'off'})`}
        </span>
      </div>
    </div>
  );
}
