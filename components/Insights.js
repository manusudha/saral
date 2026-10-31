'use client';
import { useDispatch, useSelector } from 'react-redux';
import { inr, prettyDate } from '@/lib/format';
import { setViewDoc } from '@/store/journeySlice';
import { SCHEMAS, fieldDef } from '@/lib/schemas';
import policy from '@/data/policy.json';

const NET = {
  network: { text: 'Network hospital', cls: 'bg-emerald-50 text-ok border-emerald-200' },
  non_network: { text: 'Not in network', cls: 'bg-amber-50 text-warn border-amber-200' },
  unknown: { text: 'Network check pending', cls: 'bg-slate-50 text-mute border-line' },
  need_city: { text: 'Which branch?', cls: 'bg-slate-50 text-mute border-line' },
  ambiguous: { text: 'Which branch?', cls: 'bg-slate-50 text-mute border-line' },
};
const TYPE = {
  cashless: { title: 'Cashless', body: 'The hospital asks the insurer/TPA for pre-authorisation. Cashless is subject to their approval.' },
  reimbursement: { title: 'Reimbursement', body: 'You paid the hospital. Send the documents and the insurer pays you back after review.' },
  intimation: { title: 'Intimation now, reimbursement later', body: 'Cashless may not be available here. Keep every bill; claim reimbursement after discharge.' },
};

// Sample policy assumptions and hospital context at the top of the claim
export function ClaimContext({ status }) {
  const net = status?.network;
  const type = status?.claimType;
  const remaining = policy.sumInsured - policy.sumInsuredUsed;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Illustrative sample only</div>
            <div className="mt-1 text-sm font-semibold text-ink">{policy.productName}</div>
            <div className="text-xs text-mute">{policy.insurer} · TPA: {policy.tpa}</div>
          </div>
          <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">Demo</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-mute">Example dates</dt><dd className="text-right font-medium text-ink">{prettyDate(policy.startDate)} – {prettyDate(policy.endDate)}</dd>
          <dt className="text-mute">Example cover left</dt><dd className="text-right font-medium text-ink">{inr(remaining)} of {inr(policy.sumInsured)}</dd>
          <dt className="text-mute">Example co-pay</dt><dd className="text-right font-medium text-ink">{policy.copay.percent}% for parents</dd>
          <dt className="text-mute">Example room rent</dt><dd className="text-right font-medium text-ink">up to {inr(policy.roomRentCapPerDay)}/day</dd>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-warn">These sample terms are not taken from your account or verified against your policy.</p>
      </div>
      <div className={`rounded-2xl border p-4 ${type ? 'border-sky/40 bg-sky-50/60' : 'border-dashed border-line bg-white'}`}>
        {type ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-navy">{TYPE[type].title}</div>
              {net && <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${NET[net.status]?.cls}`}>{NET[net.status]?.text}</span>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-mute">{TYPE[type].body}</p>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-ink">Claim type</div>
            <p className="mt-1 text-xs leading-relaxed text-mute">Saral decides cashless or reimbursement once it knows the hospital and whether the patient is still admitted.</p>
          </>
        )}
        {net?.hospital && <div className="mt-2 text-xs text-ink">{net.hospital.name}, {net.hospital.area}, {net.hospital.city}</div>}
        {net && <div className="mt-1 text-[11px] text-mute">Network data: demo list, not live insurer data</div>}
      </div>
    </div>
  );
}

export function IssuesList({ status, lang, compact = false }) {
  const issues = (status?.issues || []).filter((i) => i.severity !== 'info');
  if (!issues.length) return null;
  return (
    <div className="space-y-2" role="list" aria-label="Things to check">
      {issues.map((w) => (
        <div role="listitem" key={w.id} className={`flex gap-2 rounded-xl border px-3 py-2 text-sm ${w.severity === 'block' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-warn'}`}>
          <span aria-hidden>{w.severity === 'block' ? '⛔' : '⚠️'}</span>
          <span><b>{w.severity === 'block' ? 'Needs fixing: ' : 'Check: '}</b>{compact ? (w[lang] || w.en).split('. ')[0] + '.' : w[lang] || w.en}</span>
        </div>
      ))}
    </div>
  );
}

// Payout / EMI breakdown — all numbers come from lib/rules.js
export function Breakdown({ journey, status }) {
  const lines = status?.breakdown || [];
  const c = status?.computed || {};
  if (!lines.length) return null;
  if (journey === 'health_claim') {
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="bg-navy px-5 py-4 text-white">
          <div className="text-sm text-sky-100">{status.claimType === 'reimbursement' ? 'Estimated payout' : 'Estimated insurer share'}</div>
          <div className="text-4xl font-extrabold tabular-nums">{inr(c.payout)}</div>
          {c.youPay > 0 && <div className="mt-0.5 text-xs text-sky-100">You pay about {inr(c.youPay)}</div>}
        </div>
        <table className="w-full text-sm">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className={`${l.kind === 'total' ? 'border-t-2 border-ink/10 font-bold' : 'border-t border-line'}`}>
                <td className="px-4 py-2 text-mute">{l.label}</td>
                <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${l.amount < 0 ? 'text-warn' : 'text-ink'}`}>{l.amount < 0 ? `− ${inr(-l.amount)}` : inr(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-mute">Illustrative estimate using sample policy terms, not your policy data. The insurer/TPA decides the approved amount after reviewing your documents.</p>
      </div>
    );
  }
  const ok = c.outcome === 'indicatively_eligible';
  const head = ok ? 'Indicatively eligible' : c.outcome === 'lower_amount' ? 'Lower amount suggested' : c.outcome === 'pending_details' ? 'A few details still needed' : 'Criteria not met';
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className={`px-5 py-4 text-white ${ok ? 'bg-navy' : c.outcome === 'pending_details' ? 'bg-slate-600' : 'bg-warn'}`}>
        <div className="text-sm text-white/85">{head}</div>
        <div className="text-4xl font-extrabold tabular-nums">{inr(c.newEmi)}<span className="text-base font-semibold text-white/80"> /month EMI</span></div>
        {!ok && c.maxAmount > 0 && <div className="mt-0.5 text-xs text-white/85">Indicative maximum for this tenure: {inr(c.maxAmount)}{c.tenureNeeded ? ` · or the full amount over ${c.tenureNeeded} months` : ''}</div>}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className={`${l.kind === 'total' ? 'border-t-2 border-ink/10 font-bold' : 'border-t border-line'}`}>
              <td className="px-4 py-2 text-mute">{l.label}</td>
              <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${l.kind === 'over' ? 'font-bold text-warn' : l.kind === 'ok' ? 'font-bold text-ok' : l.amount < 0 ? 'text-warn' : 'text-ink'}`}>{l.amount < 0 ? `− ${inr(-l.amount)}` : inr(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-1 border-t border-line px-4 py-3 text-sm">
        {(c.checks || []).map((ch) => (
          <li key={ch.id} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${ch.pass === true ? 'bg-ok text-white' : ch.pass === false ? 'bg-warn text-white' : 'bg-slate-200 text-mute'}`} aria-hidden>{ch.pass === true ? '✓' : ch.pass === false ? '!' : '?'}</span>
              <span className="text-ink">{ch.label}</span>
            </span>
            <span className="text-xs text-mute">{ch.pass === true ? 'Met' : ch.pass === false ? 'Not met' : 'Pending'} · {ch.detail}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-mute">*{c.label}. Not a loan offer. FOIR = (existing obligations + new EMI) ÷ monthly income.</p>
    </div>
  );
}

// Loan Key-Fact style summary before submitting
export function LoanDisclosure({ fields, status }) {
  const c = status?.computed || {};
  if (c.newEmi === undefined) return null;
  const v = (k) => fields[k]?.value;
  const rows = [
    ['Loan amount requested', inr(v('loanAmount'))],
    ['Indicative eligible amount', inr(Math.min(c.maxAmount || 0, Number(v('loanAmount'))) || c.maxAmount)],
    ['Interest rate (illustrative)', `${c.rate}% a year, reducing balance`],
    ['Tenure', `${v('tenureMonths')} months`],
    ['EMI', inr(c.newEmi)],
    ['Total interest', inr(c.totalInterest)],
    ['Total repayment', inr(c.totalRepayment)],
    ['Processing fee (illustrative)', `${inr(c.fee)} + ${inr(c.gst)} GST`],
    ['Amount you’d receive', inr(c.netDisbursal)],
  ];
  return (
    <div className="rounded-2xl border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-bold text-ink">Key facts (indicative)</h3>
        <p className="text-xs text-mute">The lender must give you its own Key Fact Statement before you accept any loan.</p>
      </div>
      <dl className="divide-y divide-line text-sm">
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-3 px-4 py-2"><dt className="text-mute">{k}</dt><dd className="text-right font-semibold tabular-nums text-ink">{val}</dd></div>
        ))}
      </dl>
    </div>
  );
}

// Full-screen viewer for an uploaded document (opened from a 📄 source chip)
export function DocViewer() {
  const dispatch = useDispatch();
  const { viewDoc, docs, docPreviews, journey } = useSelector((s) => s.journey);
  if (!viewDoc) return null;
  const entry = Object.entries(docs).find(([, d]) => d.id === viewDoc);
  const doc = entry?.[1];
  const url = docPreviews[viewDoc];
  const schema = SCHEMAS[journey];
  return (
    <div role="dialog" aria-modal="true" aria-label="Document" className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={() => dispatch(setViewDoc(null))}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <div className="truncate font-bold text-ink">{doc?.name || 'Document'}</div>
            <div className="text-xs text-mute">{entry?.[0]} · read by {doc?.readBy === 'ai' ? 'AI' : doc?.readBy === 'sample' ? 'demo sample (not AI)' : doc?.readBy}{doc?.page ? ` · values from page ${doc.page}` : ''}</div>
          </div>
          <button onClick={() => dispatch(setViewDoc(null))} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-mute hover:text-navy" autoFocus>Close</button>
        </div>
        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1fr_280px]">
          <div className="min-h-[300px] overflow-auto bg-canvas">
            {!url ? <div className="p-8 text-center text-sm text-mute">The original file is only kept on the device it was uploaded from.</div>
              : url.startsWith('data:application/pdf') ? <iframe title="PDF" src={`${url}#page=${doc?.page || 1}`} className="h-[70vh] w-full" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={url} alt={doc?.name || 'Uploaded document'} className="w-full" />}
          </div>
          <div className="overflow-auto border-t border-line p-4 md:border-l md:border-t-0">
            <h3 className="text-sm font-semibold text-ink">What Saral read</h3>
            <dl className="mt-2 space-y-2 text-sm">
              {Object.entries(doc?.extracted || {}).filter(([k]) => fieldDef(schema, k)).map(([k, val]) => (
                <div key={k}><dt className="text-xs text-mute">{fieldDef(schema, k).label}</dt><dd className="font-semibold text-ink">{typeof val === 'number' ? inr(val) : /^\d{4}-\d{2}-\d{2}$/.test(String(val)) ? prettyDate(val) : String(val)}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
