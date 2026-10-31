'use client';
import Link from 'next/link';
import { useState } from 'react';
import Logo from '@/components/Logo';
import { SignedIn, UserButton } from '@clerk/nextjs';

const CARDS = [
  {
    href: '/journey/health_claim',
    tag: 'Insurance',
    title: 'File a health claim',
    text: 'Tell Saral what happened and snap the hospital bill. The claim form fills itself.',
    meta: '2 photos · about 2 minutes',
    icon: '🏥',
  },
  {
    href: '/journey/loan_precheck',
    tag: 'Lending',
    title: 'Personal loan pre-check',
    text: 'Say how much you need. Saral checks eligibility and explains your EMI in your language.',
    meta: 'No credit score impact',
    icon: '💸',
  },
];

export default function Home() {
  const [resetMsg, setResetMsg] = useState('');

  async function resetMemory() {
    await fetch('/api/reset', { method: 'POST' });
    setResetMsg('Memory cleared — next journeys start fresh.');
    setTimeout(() => setResetMsg(''), 3000);
  }

  return (
    <main className="min-h-screen">
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Logo light />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <SignedIn>
                <UserButton />
              </SignedIn>
              <span className="hidden rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-sky-100 sm:inline-flex">Paytm Build for India · Track 2</span>
            </div>
          </div>
          <div className="mt-14 max-w-3xl">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
              Finish any insurance or loan journey <span className="text-sky">in one conversation.</span>
            </h1>
            <p className="mt-5 text-lg text-sky-100 md:text-xl">
              Speak in Hindi or English, send a photo — Saral fills the form, explains the terms and flags what’s missing before you submit.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-14 max-w-6xl px-6">
        <div className="grid gap-6 md:grid-cols-2">
          {CARDS.map((c) => (
            <Link key={c.href} href={c.href} className="group rounded-3xl border border-line bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-start justify-between">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-50 text-3xl">{c.icon}</div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-mute">{c.tag}</span>
              </div>
              <h2 className="mt-5 text-2xl font-bold text-ink">{c.title}</h2>
              <p className="mt-2 text-mute">{c.text}</p>
              <div className="mt-6 flex items-center justify-between">
                <span className="text-sm font-medium text-mute">{c.meta}</span>
                <span className="rounded-full bg-navy px-5 py-2.5 text-sm font-bold text-white transition group-hover:bg-sky">Start →</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            ['🎤', 'Speak naturally', 'Hindi, English or Hinglish — voice powered by Sarvam AI.'],
            ['📄', 'Snap, don’t type', 'Bills and summaries are read by AI and filled into the form.'],
            ['✅', 'You stay in control', 'Every AI-filled field shows its source. You confirm before submit.'],
          ].map(([i, t, d]) => (
            <div key={t} className="rounded-2xl bg-white/70 p-5">
              <div className="text-2xl">{i}</div>
              <div className="mt-2 font-bold text-ink">{t}</div>
              <div className="mt-1 text-sm text-mute">{d}</div>
            </div>
          ))}
        </div>

        <div className="mb-16 mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-6 text-sm text-mute">
          <span className="font-semibold text-ink">Demo kit:</span>
          <Link className="font-semibold text-navy underline" href="/submissions">Past submissions &amp; audit log</Link>
          <a className="underline hover:text-navy" href="/samples/hospital-bill.jpg" target="_blank">Sample hospital bill</a>
          <a className="underline hover:text-navy" href="/samples/discharge-summary.jpg" target="_blank">Sample discharge summary</a>
          <button onClick={resetMemory} className="underline hover:text-navy">Reset Saral’s memory</button>
          {resetMsg && <span className="text-ok">{resetMsg}</span>}
        </div>
      </section>
    </main>
  );
}
