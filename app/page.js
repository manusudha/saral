import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import PwaInstallButton from '@/components/PwaInstallButton';

const FEATURES = [
  {
    icon: '🎙️',
    title: 'Just say it',
    description: 'Speak naturally in Hindi, English or Hinglish.',
  },
  {
    icon: '📄',
    title: 'Snap, don’t type',
    description: 'Share a document and let Saral help fill the details.',
  },
  {
    icon: '✓',
    title: 'You stay in control',
    description: 'Review every detail before you submit.',
  },
];

export default async function WelcomePage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  return (
    <main className="min-h-screen bg-[#f5f9fc] text-[#10243e]">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Saral welcome page">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#00baf2] text-xl font-extrabold text-white">स</span>
          <span className="leading-tight">
            <span className="block text-xl font-extrabold tracking-tight text-[#002970]">Saral</span>
            <span className="hidden text-xs font-semibold text-slate-500 sm:block">A simpler way forward</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <PwaInstallButton />
          <Link href="/sign-in" className="whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-bold text-[#002970] transition hover:bg-sky-50 sm:px-4">
            Sign in
          </Link>
          <Link href="/sign-up" className="whitespace-nowrap rounded-full bg-[#00baf2] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#00a6dc] sm:px-5">
            <span className="sm:hidden">Sign up</span>
            <span className="hidden sm:inline">Create account</span>
          </Link>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-[#002970]">
        <div className="absolute -right-32 -top-40 -z-10 h-[34rem] w-[34rem] rounded-full bg-[#00baf2]/20 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-sky-100">
              <span className="h-2 w-2 rounded-full bg-[#00baf2]" />
              Made for your next step
            </div>
            <h1 className="mt-7 text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Your financial journeys, <span className="text-[#40d4ff]">made simple.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-blue-100 sm:text-lg">
              Meet Saral. Get help with an insurance claim or loan pre-check in a conversation that feels like your own.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/sign-up" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#00baf2] px-7 text-sm font-extrabold text-white shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-[#00a6dc]">
                Get started <span aria-hidden="true" className="ml-2">→</span>
              </Link>
              <Link href="/sign-in" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/30 px-7 text-sm font-bold text-white transition hover:bg-white/10">
                I already have an account
              </Link>
            </div>
            <p className="mt-5 text-xs text-blue-200">One personal account. Your next step, at your pace.</p>
          </div>

          <div className="mx-auto w-full max-w-md">
            <div className="rounded-[2rem] border border-white/30 bg-white p-6 shadow-2xl shadow-[#00183f]/30 sm:p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Welcome to Saral</p>
                  <h2 className="mt-1 text-xl font-extrabold text-[#002970]">How can we help?</h2>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e6f9ff] text-2xl" aria-hidden="true">✨</span>
              </div>

              <div className="mt-7 space-y-3">
                <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e6f9ff] text-xl" aria-hidden="true">🏥</span>
                  <div>
                    <p className="font-bold text-slate-800">Health insurance claim</p>
                    <p className="mt-0.5 text-sm text-slate-500">Share what happened. We’ll guide you.</p>
                  </div>
                  <span className="ml-auto text-lg text-[#00a9df]" aria-hidden="true">›</span>
                </div>
                <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff5e6] text-xl" aria-hidden="true">💸</span>
                  <div>
                    <p className="font-bold text-slate-800">Personal loan pre-check</p>
                    <p className="mt-0.5 text-sm text-slate-500">Understand your options and EMI.</p>
                  </div>
                  <span className="ml-auto text-lg text-[#00a9df]" aria-hidden="true">›</span>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2 rounded-xl bg-[#f0fbff] px-4 py-3 text-sm font-medium text-[#24516e]">
                <span className="text-[#00a9df]" aria-hidden="true">✓</span>
                You review everything before submitting.
              </div>
            </div>
            <p className="mt-4 text-center text-xs font-medium text-blue-100">Paytm Build for India · Track 2</p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-10 sm:px-8 sm:py-14 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e6f9ff] text-lg font-bold text-[#007da8]" aria-hidden="true">
              {feature.icon}
            </span>
            <div>
              <h2 className="font-bold text-[#002970]">{feature.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">{feature.description}</p>
            </div>
          </article>
        ))}
      </section>

      <footer className="mx-auto max-w-7xl px-5 pb-8 text-center text-xs text-slate-400 sm:px-8">
        A Paytm Build for India · Track 2 prototype
      </footer>
    </main>
  );
}
