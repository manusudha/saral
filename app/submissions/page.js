import Link from 'next/link';
import Logo from '@/components/Logo';
import ResetAllButton from '@/components/ResetAllButton';
import { listSubmissions, stats } from '@/lib/db';
import { SCHEMAS } from '@/lib/schemas';
import { inr } from '@/lib/format';
import { istTime } from '@/lib/time';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { statelessSessionsEnabled } from '@/lib/statelessSession';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Past submissions · Saral' };

export default async function SubmissionsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const stateless = statelessSessionsEnabled();
  const rows = stateless ? [] : listSubmissions(userId);
  const s = stateless ? { sessions: 0, submissions: 0, aiFields: 0, userEdits: 0, documents: 0 } : stats(userId);
  const tiles = [
    ['Journeys started', s.sessions],
    ['Submitted', s.submissions],
    ['Fields filled by AI', s.aiFields],
    ['Edits by users', s.userEdits],
    ['Documents read', s.documents],
  ];
  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/dashboard"><Logo /></Link>
          <nav className="ml-auto flex items-center gap-2 text-sm font-semibold">
            <Link href="/dashboard" className="rounded-full px-3 py-1.5 text-mute hover:text-navy">Home</Link>
            <span className="rounded-full bg-navy px-3 py-1.5 text-white">Past submissions</span>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-ink">Past submissions</h1>
            <p className="mt-1 text-mute">Every claim and pre-check, with a full record of what the AI filled, from what, and what the user changed.</p>
            {stateless && <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">Submission history needs shared persistent storage and is unavailable in stateless mode.</p>}
          </div>
          <ResetAllButton />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {tiles.map(([label, n]) => (
            <div key={label} className="rounded-2xl border border-line bg-white p-4">
              <div className="text-3xl font-extrabold text-navy">{n}</div>
              <div className="text-sm text-mute">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-white">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-mute">
              Nothing submitted yet. <Link href="/journey/health_claim" className="font-semibold text-sky underline">File a claim</Link> to see it here.
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-mute">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Journey</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">AI fills / edits</th>
                  <th className="px-4 py-3">n8n</th>
                  <th className="px-4 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-sky-50/50">
                    <td className="px-4 py-3"><Link href={`/submissions/${r.id}`} className="whitespace-nowrap font-mono font-bold text-navy underline-offset-2 hover:underline">{r.id}</Link></td>
                    <td className="px-4 py-3">{SCHEMAS[r.journey]?.title || r.journey}</td>
                    <td className="px-4 py-3"><span className="whitespace-nowrap rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-navy">{r.status}</span></td>
                    <td className="px-4 py-3 text-right font-semibold">{inr(r.amount)}<div className="text-xs font-normal text-mute">{r.amount_label}</div></td>
                    <td className="px-4 py-3 text-right">{r.ai_events} / {r.user_edits}</td>
                    <td className="px-4 py-3 text-xs text-mute">{r.n8n_status}</td>
                    <td className="px-4 py-3 text-mute">{istTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
