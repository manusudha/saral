import Link from 'next/link';
import { SignIn, SignUp } from '@clerk/nextjs';

const appearance = {
  variables: {
    colorPrimary: '#00baf2',
    colorText: '#10243e',
    colorTextSecondary: '#65758b',
    colorBackground: '#ffffff',
    colorInputBackground: '#f8fafc',
    colorInputText: '#10243e',
    borderRadius: '0.875rem',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
  },
  elements: {
    card: 'w-full border-0 shadow-none',
    headerTitle: 'font-extrabold tracking-tight text-[#002970]',
    headerSubtitle: 'text-slate-500',
    socialButtonsBlockButton: 'rounded-xl border-slate-200 font-semibold hover:bg-slate-50',
    formFieldLabel: 'font-semibold text-slate-700',
    formFieldInput: 'rounded-xl border-slate-200 focus:border-[#00baf2]',
    formButtonPrimary: 'rounded-xl bg-[#00baf2] font-bold shadow-sm hover:bg-[#00a6dc]',
    footerActionLink: 'font-bold text-[#007da8] hover:text-[#002970]',
    dividerLine: 'bg-slate-200',
    dividerText: 'text-slate-400',
    identityPreviewEditButton: 'text-[#007da8]',
  },
};

export default function AuthPage({ mode }) {
  const isSignIn = mode === 'sign-in';
  const Component = isSignIn ? SignIn : SignUp;

  return (
    <main className="min-h-screen bg-[#f5f9fc] px-4 py-6 text-[#10243e] sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3" aria-label="Back to Saral welcome page">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#00baf2] font-extrabold text-white">स</span>
          <span className="text-xl font-extrabold tracking-tight text-[#002970]">Saral</span>
        </Link>
        <span className="hidden text-xs font-semibold text-slate-500 sm:block">Paytm Build for India · Track 2</span>
      </div>

      <div className="mx-auto grid min-h-[calc(100vh-6rem)] max-w-6xl items-center gap-10 py-10 lg:grid-cols-[1fr_0.9fr]">
        <section className="hidden max-w-lg lg:block">
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#008dbd]">Your next step starts here</p>
          <h1 className="mt-4 text-5xl font-extrabold leading-tight tracking-tight text-[#002970]">
            Financial journeys, made <span className="text-[#00a9df]">simpler.</span>
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            Sign in to pick up where you left off, or create your personal Saral account to get started.
          </p>
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e6f9ff] text-xl" aria-hidden="true">🔒</span>
            <p className="text-sm font-semibold text-slate-600">Sign in to pick up where you left off.</p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-xl shadow-[#002970]/[0.06] sm:p-8">
          <Link href="/" className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-[#007da8]">
            <span aria-hidden="true">←</span> Back
          </Link>
          <Component
            appearance={appearance}
            forceRedirectUrl="/dashboard"
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
          />
        </section>
      </div>
    </main>
  );
}
