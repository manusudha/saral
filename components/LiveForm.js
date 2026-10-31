'use client';
import { useDispatch, useSelector } from 'react-redux';
import { setStage } from '@/store/journeySlice';
import { displayValue } from '@/lib/format';
import SourceChip from './SourceChip';
import { ClaimContext, IssuesList, Breakdown } from './Insights';

export function docLabel(schema, key) {
  return schema.documents.find((d) => d.key === key)?.label || key;
}

export default function LiveForm() {
  const dispatch = useDispatch();
  const { schema, fields, docs, status, changed, changeNonce, journey, lang, pending } = useSelector((s) => s.journey);
  if (!schema || !status) return <div className="h-96 animate-pulse rounded-3xl bg-white" />;

  const applicable = new Set(status.applicable || []);
  const required = new Set(status.required || []);
  const filled = [...required].filter((k) => fields[k]?.value !== undefined && fields[k]?.value !== '').length;
  const docsNeeded = status.requiredDocs || [];
  const docsDone = docsNeeded.filter((d) => docs[d]).length;
  const nextKey = status.next?.kind === 'field' || status.next?.kind === 'fix' || status.next?.kind === 'conflict' ? status.next.key : null;
  const blocking = (status.issues || []).some((i) => i.severity === 'block');
  const left = status.missingFields.length + status.missingDocs.length;
  const shownDocs = [...docsNeeded, ...(status.optionalDocs || []).filter((d) => docs[d]), ...Object.keys(docs).filter((d) => !docsNeeded.includes(d) && !(status.optionalDocs || []).includes(d))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-ink">{schema.title}</h2>
          <div className="text-sm text-mute">{schema.subtitle}</div>
        </div>
        <div className="text-right text-sm text-mute">
          <span className="text-2xl font-extrabold text-navy">{filled}/{required.size}</span> details
          {docsNeeded.length ? <> · <span className="font-bold text-navy">{docsDone}/{docsNeeded.length}</span> documents</> : null}
        </div>
      </div>

      {journey === 'health_claim' && <ClaimContext status={status} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {schema.groups.map((g) => {
            const visible = g.fields.filter((f) => applicable.has(f.key));
            if (!visible.length) return null;
            return (
              <section key={g.title} aria-label={g.title}>
                <h3 className="mb-2 text-sm font-semibold text-ink">{g.title}</h3>
                <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                  {visible.map((f) => {
                    const fv = fields[f.key];
                    const has = fv && fv.value !== undefined && fv.value !== '';
                    const flash = changed.includes(f.key);
                    const asking = nextKey === f.key;
                    const conflicted = pending?.field === f.key;
                    return (
                      <div key={`${f.key}-${flash ? changeNonce : 0}`} className={`flex items-center justify-between gap-3 px-4 py-3 ${flash ? 'animate-fillin' : ''} ${conflicted ? 'bg-amber-50' : asking ? 'bg-sky-50/70' : ''}`}>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-mute">{f.label}{!required.has(f.key) && ' (optional)'}</div>
                          <div className={`truncate text-[15px] font-semibold ${has ? 'text-ink' : 'text-slate-300'}`}>
                            {has ? (f.sensitive ? `XXXXX${String(fv.value).slice(5)}` : displayValue(f, fv.value)) : conflicted ? 'Waiting for your choice' : asking ? 'Saral is asking…' : '—'}
                          </div>
                          {conflicted && <div className="text-xs font-semibold text-warn">Two sources disagree — answer in the chat</div>}
                        </div>
                        {has && <SourceChip source={fv.source} docId={fv.docId} page={fv.page} verified={fv.verified} />}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          {shownDocs.length > 0 && (
            <div className="rounded-2xl border border-line bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">Documents</h3>
              <ul className="space-y-2">
                {shownDocs.map((k) => (
                  <li key={k} className="flex items-center gap-3 text-sm">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${docs[k] ? 'bg-ok text-white' : 'border-2 border-dashed border-slate-300'}`} aria-hidden>{docs[k] ? '✓' : ''}</span>
                    <span className={docs[k] ? 'font-semibold text-ink' : 'text-mute'}>{docLabel(schema, k)}</span>
                    <span className="ml-auto text-xs text-mute">{docs[k] ? (docs[k].readBy === 'ai' ? 'Read by AI' : 'Demo sample') : 'Needed'}</span>
                  </li>
                ))}
              </ul>
              {(status.optionalDocs || []).filter((d) => !docs[d]).length > 0 && (
                <p className="mt-3 text-xs text-mute">Also helpful: {(status.optionalDocs || []).filter((d) => !docs[d]).map((d) => docLabel(schema, d).toLowerCase()).join(', ')}.</p>
              )}
            </div>
          )}
          <Breakdown journey={journey} status={status} />
          <IssuesList status={status} lang={lang} compact />
          <button
            onClick={() => dispatch(setStage('review'))}
            disabled={!status.complete || !!pending}
            className="w-full rounded-2xl bg-sky px-5 py-4 text-base font-bold text-white shadow-sm transition hover:bg-navy disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {status.complete && !pending ? 'Review and submit' : pending ? 'Answer Saral’s question first' : blocking && !left ? 'Fix the issue above to continue' : left === 1 ? '1 thing left to add' : `${left} things left to add`}
          </button>
        </aside>
      </div>
    </div>
  );
}
