import Link from 'next/link';
import { notFound } from 'next/navigation';
import Logo from '@/components/Logo';
import SourceChip from '@/components/SourceChip';
import { getSubmissionDetail } from '@/lib/db';
import { SCHEMAS, fieldDef } from '@/lib/schemas';
import { displayValue, inr } from '@/lib/format';
import { istTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

const ACTOR_STYLE = {
  ai: 'bg-sky-50 text-navy',
  user: 'bg-emerald-50 text-emerald-700',
  system: 'bg-slate-100 text-slate-700',
};
const ACTOR_LABEL = { ai: 'AI', user: 'User', system: 'System' };

function Section({ title, subtitle, children }) {
  return (
    <section className="rounded-3xl border border-line bg-white">
      <div className="border-b border-line px-6 py-4">
        <h2 className="text-lg font-extrabold text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-mute">{subtitle}</p>}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export default function SubmissionDetail({ params }) {
  const d = getSubmissionDetail(params.id);
  if (!d) notFound();
  const { submission: sub, session, events, messages, documents } = d;
  const schema = SCHEMAS[sub.journey];
  const show = (field, value) => displayValue(fieldDef(schema, field), value) || '—';
  const aiCount = events.filter((e) => e.actor === 'ai').length;
  const userCount = events.filter((e) => e.actor === 'user').length;

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <Link href="/"><Logo /></Link>
          <nav className="ml-auto flex items-center gap-2 text-sm font-semibold">
            <Link href="/" className="rounded-full px-3 py-1.5 text-mute hover:text-navy">Home</Link>
            <Link href="/submissions" className="rounded-full px-3 py-1.5 text-mute hover:text-navy">← Past submissions</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-center gap-6 rounded-3xl bg-navy p-6 text-white">
          <div>
            <div className="text-sm text-sky-100">{schema?.title}</div>
            <div className="font-mono text-2xl font-extrabold">{sub.id}</div>
            <div className="mt-1 text-sm text-sky-100">Submitted {istTime(sub.created_at)} · AI mode: {session?.ai_mode} · n8n: {sub.n8n_status}</div>
          </div>
          <div className="ml-auto flex flex-wrap gap-3">
            <div className="rounded-2xl bg-white/10 px-5 py-3"><div className="text-xs text-sky-100">Status</div><div className="font-bold">{sub.status}</div></div>
            <div className="rounded-2xl bg-white/10 px-5 py-3"><div className="text-xs text-sky-100">{sub.amount_label}</div><div className="text-xl font-extrabold">{inr(sub.amount)}</div></div>
            <div className="rounded-2xl bg-white/10 px-5 py-3"><div className="text-xs text-sky-100">AI fills · user edits</div><div className="text-xl font-extrabold">{aiCount} · {userCount}</div></div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Final form" subtitle="What was submitted, and where each value came from">
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {schema.groups.flatMap((g) => g.fields).map((f) => {
                const fv = sub.fields[f.key];
                return (
                  <div key={f.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="text-xs text-mute">{f.label}</div>
                      <div className="truncate font-semibold text-ink">{fv ? show(f.key, fv.value) : '—'}</div>
                    </div>
                    {fv && <SourceChip source={fv.source} />}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Conversation" subtitle="Full transcript of the journey">
            <div className="scroll-thin max-h-[560px] space-y-2 overflow-y-auto pr-2">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-navy text-white' : 'bg-slate-100 text-ink'}`}>
                    {m.kind === 'voice' && '🎤 '}{m.kind === 'doc' && '📄 '}{m.text}
                    <div className={`mt-0.5 text-[10px] ${m.role === 'user' ? 'text-sky-100' : 'text-mute'}`}>{istTime(m.created_at, false)}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section title="Audit trail" subtitle="Every value written to the form, in order — who wrote it, the old and new value, and what it was based on">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-xs font-semibold text-mute">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Field</th>
                  <th className="py-2 pr-3">Change</th>
                  <th className="py-2 pr-3">By</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3 text-right">Confidence</th>
                  <th className="py-2">Based on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {events.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="whitespace-nowrap py-2.5 pr-3 text-mute">{istTime(e.created_at, false)}</td>
                    <td className="py-2.5 pr-3 font-semibold">{fieldDef(schema, e.field)?.label || e.field}</td>
                    <td className="py-2.5 pr-3">
                      {JSON.stringify(e.old_value) === JSON.stringify(e.new_value) ? (
                        <><span className="font-semibold text-ink">{show(e.field, e.new_value)}</span> <span className="text-xs font-semibold text-ok">✓ confirmed</span></>
                      ) : (
                        <>
                          {e.old_value !== null && e.old_value !== undefined && <><span className="text-mute line-through">{show(e.field, e.old_value)}</span>{' → '}</>}
                          <span className="font-semibold text-ink">{show(e.field, e.new_value)}</span>
                        </>
                      )}
                    </td>
                    <td className="py-2.5 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ACTOR_STYLE[e.actor]}`}>{ACTOR_LABEL[e.actor] || e.actor}</span></td>
                    <td className="py-2.5 pr-3"><SourceChip source={e.source} /></td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{e.confidence != null ? `${Math.round(e.confidence * 100)}%` : ''}</td>
                    <td className="max-w-[320px] py-2.5 text-xs text-mute">{e.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {documents.length > 0 && (
          <Section title="Documents read" subtitle="What was extracted from each photo">
            <div className="grid gap-4 md:grid-cols-2">
              {documents.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-ink">📄 {doc.file_name}</div>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{doc.doc_type} · read by {doc.read_by}</span>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    {Object.entries(doc.extracted || {}).map(([k, v]) => (
                      <div key={k} className="flex gap-3">
                        <dt className="w-36 shrink-0 text-mute">{fieldDef(schema, k)?.label || k}</dt>
                        <dd className="font-semibold text-ink">{show(k, v)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2 text-xs text-mute">{istTime(doc.created_at)}</div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </main>
  );
}
