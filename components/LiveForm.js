'use client';
import { useDispatch, useSelector } from 'react-redux';
import { setStage } from '@/store/journeySlice';
import { allFields } from '@/lib/schemas';
import { displayValue, inr } from '@/lib/format';
import SourceChip from './SourceChip';

export function OutcomeCard({ journey, status, lang }) {
  const c = status?.computed || {};
  if (journey === 'health_claim' && c.payout !== undefined) {
    return (
      <div className="rounded-2xl bg-navy p-5 text-white">
        <div className="text-sm text-sky-100">Estimated payout</div>
        <div className="mt-1 text-4xl font-extrabold">{inr(c.payout)}</div>
        <ul className="mt-3 space-y-1 text-sm text-sky-100">
          {(status.explain?.[lang] || status.explain?.en || []).map((l) => <li key={l}>• {l}</li>)}
        </ul>
      </div>
    );
  }
  if (journey === 'loan_precheck' && c.newEmi !== undefined) {
    return (
      <div className={`rounded-2xl p-5 text-white ${c.eligible ? 'bg-navy' : 'bg-warn'}`}>
        <div className="text-sm text-white/85">{c.eligible ? 'Eligible · monthly EMI' : 'Above your limit · you can borrow up to'}</div>
        <div className="mt-1 text-4xl font-extrabold">{c.eligible ? inr(c.newEmi) : inr(c.maxAmount)}</div>
        <ul className="mt-3 space-y-1 text-sm text-white/85">
          {(status.explain?.[lang] || status.explain?.en || []).map((l) => <li key={l}>• {l}</li>)}
        </ul>
      </div>
    );
  }
  return null;
}

export function Warnings({ status, lang }) {
  if (!status?.warnings?.length) return null;
  return (
    <div className="space-y-2">
      {status.warnings.map((w) => (
        <div key={w.en} className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-warn">
          <span aria-hidden>⚠️</span><span><b>Check: </b>{w[lang] || w.en}</span>
        </div>
      ))}
    </div>
  );
}

export default function LiveForm() {
  const dispatch = useDispatch();
  const { schema, fields, docs, status, changed, changeNonce, journey, lang } = useSelector((s) => s.journey);
  if (!schema) return <div className="h-96 animate-pulse rounded-3xl bg-white" />;

  const required = allFields(schema).filter((f) => f.required);
  const filled = required.filter((f) => fields[f.key]?.value !== undefined && fields[f.key]?.value !== '').length;
  const docsDone = schema.documents.filter((d) => docs[d.key]).length;
  const total = required.length + schema.documents.length;
  const pct = Math.round(((filled + docsDone) / Math.max(total, 1)) * 100);
  const nextKey = status?.next?.kind === 'field' ? status.next.key : null;

  return (
    <div className="rounded-3xl border border-line bg-white shadow-sm">
      <div className="border-b border-line px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-ink">{schema.title}</h2>
            <div className="text-sm text-mute">{schema.subtitle}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold text-navy">{pct}%</div>
            <div className="text-xs text-mute">{filled}/{required.length} fields{schema.documents.length ? ` · ${docsDone}/${schema.documents.length} documents` : ''}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {schema.groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-sm font-semibold text-ink">{g.title}</h3>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {g.fields.map((f) => {
                  const fv = fields[f.key];
                  const has = fv && fv.value !== undefined && fv.value !== '';
                  const flash = changed.includes(f.key);
                  return (
                    <div
                      key={`${f.key}-${flash ? changeNonce : 0}`}
                      className={`flex items-center justify-between gap-3 px-4 py-3 ${flash ? 'animate-fillin' : ''} ${nextKey === f.key ? 'bg-sky-50/60' : ''}`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-mute">{f.label}{!f.required && ' (optional)'}</div>
                        <div className={`truncate text-[15px] font-semibold ${has ? 'text-ink' : 'text-slate-300'}`}>
                          {has ? displayValue(f, fv.value) : nextKey === f.key ? 'Saral is asking…' : 'Waiting'}
                        </div>
                      </div>
                      {has && <SourceChip source={fv.source} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          {schema.documents.length > 0 && (
            <div className="rounded-2xl border border-line p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">Documents</h3>
              <ul className="space-y-2">
                {schema.documents.map((d) => (
                  <li key={d.key} className="flex items-center gap-3 text-sm">
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${docs[d.key] ? 'bg-ok text-white' : 'border-2 border-dashed border-slate-300 text-slate-300'}`}>
                      {docs[d.key] ? '✓' : ''}
                    </span>
                    <span className={docs[d.key] ? 'font-semibold text-ink' : 'text-mute'}>{d.label}</span>
                    <span className="ml-auto text-xs text-mute">{docs[d.key] ? 'Read by AI' : 'Needed'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <OutcomeCard journey={journey} status={status} lang={lang} />
          <Warnings status={status} lang={lang} />
          <button
            onClick={() => dispatch(setStage('review'))}
            disabled={!status?.complete}
            className="w-full rounded-2xl bg-sky px-5 py-4 text-base font-bold text-white shadow-sm transition hover:bg-navy disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {status?.complete ? 'Review and submit' : (() => { const n = (status?.missingFields.length || 0) + (status?.missingDocs.length || 0); return n === 1 ? '1 thing left to add' : `${n} things left to add`; })()}
          </button>
        </div>
      </div>
    </div>
  );
}
