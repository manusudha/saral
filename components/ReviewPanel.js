'use client';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { editFieldAndLog, setStage, submitJourney } from '@/store/journeySlice';
import { displayValue } from '@/lib/format';
import SourceChip from './SourceChip';
import { IssuesList, Breakdown, LoanDisclosure, ClaimContext } from './Insights';
import { docLabel } from './LiveForm';
import policy from '@/data/policy.json';

const UNVERIFIED = ['voice', 'chat'];

function Row({ def, fv, required }) {
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const unverified = fv && UNVERIFIED.includes(fv.source) && !fv.verified;
  const low = fv && fv.confidence < 0.8 && fv.source !== 'user';
  const has = fv && fv.value !== undefined && fv.value !== '';
  const shown = has ? (def.sensitive ? `XXXXX${String(fv.value).slice(5)}` : displayValue(def, fv.value)) : '';

  function save() {
    dispatch(editFieldAndLog({ key: def.key, value: draft }));
    setEditing(false);
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-3 ${low ? 'bg-amber-50' : ''}`}>
      <div className="min-w-[180px] flex-1">
        <label htmlFor={`edit-${def.key}`} className="text-xs font-medium text-mute">{def.label}{!required && ' (optional)'}</label>
        {editing ? (
          def.type === 'enum' ? (
            <select id={`edit-${def.key}`} value={draft} onChange={(e) => setDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-sky px-2 py-1.5 text-[15px] outline-none focus:ring-4 focus:ring-sky/20">
              <option value="">Select…</option>
              {def.options.map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input
              id={`edit-${def.key}`}
              autoFocus
              type={def.type === 'date' ? 'date' : def.type === 'number' ? 'number' : 'text'}
              inputMode={def.type === 'number' ? 'numeric' : undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="mt-1 w-full rounded-lg border border-sky px-2 py-1.5 text-[15px] outline-none focus:ring-4 focus:ring-sky/20"
            />
          )
        ) : (
          <div className="text-[15px] font-semibold text-ink">{shown || <span className="text-slate-300">Empty</span>}</div>
        )}
        {!editing && (unverified || low) && <div className="mt-0.5 text-xs font-semibold text-warn">{low ? 'Low confidence — please double-check' : 'From the conversation — please confirm it’s right'}</div>}
      </div>
      {fv && !editing && <SourceChip source={fv.source} docId={fv.docId} page={fv.page} verified={fv.verified} />}
      {editing ? (
        <div className="flex gap-2">
          <button onClick={save} className="rounded-lg bg-navy px-3 py-1.5 text-xs font-bold text-white">Save</button>
          <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-mute">Cancel</button>
        </div>
      ) : (
        <button onClick={() => { setDraft(fv?.value ?? ''); setEditing(true); }} className="rounded-lg px-2 py-1 text-xs font-bold text-sky hover:bg-sky-50" aria-label={`Edit ${def.label}`}>Edit</button>
      )}
    </div>
  );
}

const CONSENT = {
  health_claim: (type) => ({
    accurate: 'I confirm these details and documents are true and complete. Giving wrong information can lead to the claim being rejected.',
    share: `I agree that Saral may share these details and documents with ${policy.insurer} and its TPA (${policy.tpa}) to process this ${type === 'cashless' ? 'cashless request' : type === 'intimation' ? 'intimation' : 'claim'}.`,
  }),
  loan_precheck: () => ({
    accurate: 'I confirm these details are correct. I understand this is an indicative estimate, not a loan offer or approval.',
    share: 'I agree that Saral may use these details to estimate my eligibility, and share them with a regulated lender (bank/NBFC) only after I choose a lender. Any credit-bureau check will need my separate consent.',
  }),
};

export default function ReviewPanel() {
  const dispatch = useDispatch();
  const { schema, fields, docs, status, journey, lang, busy, error, pending } = useSelector((s) => s.journey);
  const [consents, setConsents] = useState({ accurate: false, share: false });
  const applicable = new Set(status.applicable || []);
  const required = new Set(status.required || []);
  const aiCount = Object.values(fields).filter((f) => ['voice', 'chat', 'document'].includes(f.source)).length;
  const unverified = Object.entries(fields).filter(([k, f]) => applicable.has(k) && UNVERIFIED.includes(f.source) && !f.verified).length;
  const text = CONSENT[journey](status.claimType);
  const blocking = (status.issues || []).some((i) => i.severity === 'block');
  const submitLabel = journey === 'loan_precheck' ? 'Submit for eligibility check' : status.claimType === 'cashless' ? 'Send cashless request' : status.claimType === 'intimation' ? 'Send intimation' : 'Submit claim';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-ink">Check and submit</h2>
          <p className="text-sm text-mute">Saral filled <b>{aiCount}</b> details from your conversation and documents{unverified ? <>; <b className="text-warn">{unverified}</b> came only from the conversation, so please confirm them</> : ''}. Tap Edit to change anything.</p>
        </div>
        <button onClick={() => dispatch(setStage('chat'))} className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-mute hover:text-navy">Back to chat</button>
      </div>

      {journey === 'health_claim' && <ClaimContext status={status} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {schema.groups.map((g) => {
            const visible = g.fields.filter((f) => applicable.has(f.key));
            if (!visible.length) return null;
            return (
              <section key={g.title} aria-label={g.title}>
                <h3 className="mb-2 text-sm font-semibold text-ink">{g.title}</h3>
                <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                  {visible.map((f) => <Row key={f.key} def={f} fv={fields[f.key]} required={required.has(f.key)} />)}
                </div>
              </section>
            );
          })}
          {Object.keys(docs).length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">Documents</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(docs).map(([k, d]) => (
                  <span key={k} className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-ok">✓ {docLabel(schema, k)} <span className="font-normal text-mute">· {d.readBy === 'ai' ? 'read by AI' : 'demo sample'}</span></span>
                ))}
                {(status.missingDocs || []).map((k) => <span key={k} className="rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-warn">Missing: {docLabel(schema, k)}</span>)}
              </div>
            </section>
          )}
          {journey === 'health_claim' && (
            <details className="rounded-2xl border border-line bg-white p-4 text-sm">
              <summary className="cursor-pointer font-semibold text-ink">What this policy doesn’t cover, and waiting periods</summary>
              <ul className="mt-2 space-y-1 text-mute">
                {policy.exclusions.map((x) => <li key={x.name}>• {x.name}</li>)}
                {policy.waitingPeriods.map((w) => <li key={w.name}>• {w.name} ({w.days} days)</li>)}
              </ul>
            </details>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Breakdown journey={journey} status={status} />
          {journey === 'loan_precheck' && <LoanDisclosure fields={fields} status={status} />}
          <IssuesList status={status} lang={lang} />
          <fieldset className="space-y-3 rounded-2xl border border-line bg-white p-4 text-sm text-ink">
            <legend className="px-1 text-sm font-semibold">Your confirmation</legend>
            {['accurate', 'share'].map((k) => (
              <label key={k} className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={consents[k]} onChange={(e) => setConsents((c) => ({ ...c, [k]: e.target.checked }))} className="mt-0.5 h-5 w-5 shrink-0 accent-[#00BAF2]" />
                <span className="leading-relaxed">{text[k]}</span>
              </label>
            ))}
            <p className="text-xs text-mute">Saral never submits on its own — only when you press the button below.</p>
          </fieldset>
          {error && <div role="alert" className="text-sm font-medium text-warn">{error}</div>}
          <button
            onClick={() => dispatch(submitJourney({ consents }))}
            disabled={!consents.accurate || !consents.share || !status.complete || blocking || !!pending || busy === 'submitting'}
            className="w-full rounded-2xl bg-sky px-5 py-4 text-base font-bold text-white shadow-sm transition hover:bg-navy disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {busy === 'submitting' ? 'Submitting…' : submitLabel}
          </button>
        </aside>
      </div>
    </div>
  );
}
