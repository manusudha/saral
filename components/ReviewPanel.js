'use client';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { editFieldAndLog, setStage, submitJourney } from '@/store/journeySlice';
import { displayValue } from '@/lib/format';
import SourceChip from './SourceChip';
import { OutcomeCard, Warnings } from './LiveForm';
import policy from '@/data/policy.json';

function Row({ def, fv }) {
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const low = fv && fv.confidence < 0.8 && fv.source !== 'user';

  function start() {
    setDraft(fv?.value ?? '');
    setEditing(true);
  }
  function save() {
    dispatch(editFieldAndLog({ key: def.key, value: draft }));
    setEditing(false);
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${low ? 'bg-amber-50' : ''}`}>
      <div className="min-w-[160px] flex-1">
        <div className="text-xs font-medium text-mute">{def.label}</div>
        {editing ? (
          def.type === 'enum' ? (
            <select value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-sky px-2 py-1.5 text-[15px] outline-none">
              <option value="">Select…</option>
              {def.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input
              autoFocus
              type={def.type === 'date' ? 'date' : def.type === 'number' ? 'number' : 'text'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="mt-1 w-full rounded-lg border border-sky px-2 py-1.5 text-[15px] outline-none"
            />
          )
        ) : (
          <div className="text-[15px] font-semibold text-ink">{displayValue(def, fv?.value) || <span className="text-slate-300">Empty</span>}</div>
        )}
        {low && !editing && <div className="mt-0.5 text-xs font-semibold text-warn">Please double-check this</div>}
      </div>
      {fv && !editing && <SourceChip source={fv.source} />}
      {editing ? (
        <div className="flex gap-2">
          <button onClick={save} className="rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white">Save</button>
          <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-mute">Cancel</button>
        </div>
      ) : (
        <button onClick={start} className="rounded-lg px-2 py-1 text-xs font-bold text-sky hover:bg-sky-50">Edit</button>
      )}
    </div>
  );
}

export default function ReviewPanel() {
  const dispatch = useDispatch();
  const { schema, fields, docs, status, journey, lang, busy, error } = useSelector((s) => s.journey);
  const [agree, setAgree] = useState(false);
  const aiCount = Object.values(fields).filter((f) => ['voice', 'chat', 'document'].includes(f.source)).length;

  return (
    <div className="rounded-3xl border border-line bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-6 py-5">
        <div>
                    <h2 className="text-2xl font-extrabold text-ink">Check and submit</h2>
          <div className="text-sm text-mute">Saral filled <b>{aiCount}</b> fields from your voice and documents. Each one shows where it came from — edit anything that’s wrong.</div>
        </div>
        <button onClick={() => dispatch(setStage('chat'))} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-mute hover:text-navy">← Back to chat</button>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {schema.groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-sm font-semibold text-ink">{g.title}</h3>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {g.fields.map((f) => <Row key={f.key} def={f} fv={fields[f.key]} />)}
              </div>
            </div>
          ))}
          {schema.documents.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Documents</h3>
              <div className="flex flex-wrap gap-2">
                {schema.documents.map((d) => (
                  <span key={d.key} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${docs[d.key] ? 'bg-emerald-50 text-ok' : 'bg-amber-50 text-warn'}`}>
                    {docs[d.key] ? '✓' : '!'} {d.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <OutcomeCard journey={journey} status={status} lang={lang} />
          <Warnings status={status} lang={lang} />
          {journey === 'health_claim' && (
            <details className="rounded-2xl border border-line p-4 text-sm">
              <summary className="cursor-pointer font-bold text-ink">What this policy doesn’t cover</summary>
              <ul className="mt-2 space-y-1 text-mute">
                {policy.exclusions.map((x) => <li key={x}>• {x}</li>)}
              </ul>
            </details>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-ink">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#00BAF2]" />
            I have checked these details and they are correct.
          </label>
          {error && <div className="text-sm font-medium text-warn">{error}</div>}
          <button
            onClick={() => dispatch(submitJourney())}
            disabled={!agree || !status?.complete || busy === 'submitting'}
            className="w-full rounded-2xl bg-sky px-5 py-4 text-base font-bold text-white shadow-sm transition hover:bg-navy disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy === 'submitting' ? 'Submitting…' : journey === 'health_claim' ? 'Submit claim' : 'Check my offer'}
          </button>
        </div>
      </div>
    </div>
  );
}
