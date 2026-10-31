import { NextResponse } from 'next/server';
import { evaluate } from '@/lib/rules';
import { remember } from '@/lib/memory';
import { sessionExists, saveSubmission, updateSubmissionN8n, logMessage } from '@/lib/db';
import { maskPan } from '@/lib/agent';
import policy from '@/data/policy.json';

export const dynamic = 'force-dynamic';

function ref(prefix) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function notifyN8n(payload) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return { sent: false, reason: 'N8N_WEBHOOK_URL not set' };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    return { sent: res.ok, status: res.status };
  } catch (e) {
    return { sent: false, reason: e.message };
  } finally {
    clearTimeout(t);
  }
}

// No insurer/lender is connected yet, so statuses after submission are SIMULATED (simulated: true in the UI).
const step = (label, detail, state, extra = {}) => ({ label, detail, state, simulated: true, ...extra });

export async function POST(req) {
  const { journey, fields, docs, sessionId, consents = {}, pending } = await req.json();
  if (pending) return NextResponse.json({ error: 'Please answer Saral’s open question first.' }, { status: 400 });
  const status = evaluate(journey, fields, docs);
  if (!status.complete) return NextResponse.json({ error: 'Some details are still missing or need fixing.', status }, { status: 400 });
  if (!consents.accurate || !consents.share) return NextResponse.json({ error: 'Please confirm the details and give consent before submitting.' }, { status: 400 });
  const v = (k) => fields[k]?.value;
  const now = new Date().toISOString();
  const c = status.computed;

  let result;
  if (journey === 'health_claim') {
    const type = status.claimType;
    if (v('upiId')) remember({ upiId: v('upiId') }, sessionId);
    if (type === 'cashless') {
      result = {
        id: ref('PAU'), status: 'Pre-authorisation request prepared', headline: 'Cashless request prepared', amountLabel: 'Estimated insurer share', amount: c.payout,
        timeline: [
          step('Hospital identified', `${v('hospitalName')}, ${v('hospitalCity')}`, 'done', { at: now, simulated: false }),
          step('Network verification', 'Matched in the demo network list — live insurer check pending', 'done', { at: now }),
          step('Pre-authorisation submitted', 'The hospital insurance desk sends it to the insurer/TPA', 'current'),
          step('Insurer decision pending', 'Usually within a few hours', 'todo'),
          step('Cashless approval or rejection', 'The approved amount will show here', 'todo'),
          step('Treatment completed', '', 'todo'),
          step('Final settlement pending', 'The hospital sends the final bill to the insurer', 'todo'),
        ],
      };
    } else if (type === 'intimation') {
      result = {
        id: ref('INT'), status: 'Claim intimation recorded', headline: 'Insurer informed of admission', amountLabel: 'Estimated insurer share (after discharge)', amount: c.payout,
        timeline: [
          step('Hospital identified', `${v('hospitalName')}, ${v('hospitalCity')} — cashless not confirmed`, 'done', { at: now, simulated: false }),
          step('Intimation sent to insurer', 'So the insurer knows about this admission', 'current'),
          step('Keep every bill, receipt and report', 'You’ll need them for reimbursement', 'todo'),
          step('After discharge: file reimbursement', `Within ${policy.claimRules.reimbursementSubmissionDays} days of discharge`, 'todo'),
        ],
      };
    } else {
      result = {
        id: ref('CLM'), status: 'Submitted — insurer review pending', headline: 'Reimbursement claim submitted', amountLabel: 'Estimated payout', amount: c.payout,
        timeline: [
          step('Claim submitted', 'All details confirmed by you', 'done', { at: now, simulated: false }),
          step('Documents received', `${Object.keys(docs || {}).length} document(s) read by Saral`, 'done', { at: now, simulated: false }),
          step('Document verification', 'The insurer/TPA checks the documents', 'current'),
          step('Insurer review', 'Usually within a few working days', 'todo'),
          step('Additional information, if requested', '', 'todo'),
          step('Claim approved or rejected', 'The insurer decides the final amount', 'todo'),
          step(`Payout to ${v('upiId')}`, 'After approval', 'todo'),
        ],
      };
    }
  } else {
    remember({ fullName: v('fullName'), pan: v('pan'), upiId: v('disbursalUpi'), employerName: v('employerName') }, sessionId);
    const label = c.outcome === 'indicatively_eligible' ? 'Indicatively eligible' : c.outcome === 'lower_amount' ? 'Lower amount suggested' : 'Criteria not met';
    result = {
      id: ref('LPE'), status: label, headline: `${label}`, amountLabel: c.outcome === 'indicatively_eligible' ? 'Indicative EMI' : 'Indicative maximum amount',
      amount: c.outcome === 'indicatively_eligible' ? c.newEmi : c.maxAmount,
      disclaimer: 'This is an indicative estimate, not a loan offer or approval. A regulated lender (bank/NBFC) decides after KYC and a credit check, and must share a Key Fact Statement before you accept.',
      timeline: [
        step('Information collected', '', 'done', { at: now, simulated: false }),
        step('Eligibility calculated', `Illustrative terms (${c.configVersion})`, 'done', { at: now, simulated: false }),
        step('You confirmed the details', '', 'done', { at: now, simulated: false }),
        step('Application submitted', 'No lender connected yet — demo', 'current'),
        step('Awaiting lender verification', 'KYC and credit check by the lender', 'todo'),
        step('Lender decision pending', '', 'todo'),
        step('Loan disbursement', 'Only after a real lender sanctions the loan', 'todo'),
      ],
    };
  }

  let saved = false;
  try {
    if (sessionExists(sessionId)) {
      saveSubmission({ ...result, sessionId, journey, fields, computed: { ...c, breakdown: status.breakdown, consents }, n8nStatus: 'pending' });
      logMessage(sessionId, { role: 'user', kind: 'text', text: `Confirmed and submitted (${result.id})` });
      saved = true;
    }
  } catch (e) {
    console.error('[saral] db error on submit', e.message);
  }

  const safeFields = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { value: k === 'pan' ? maskPan(f.value) : f.value, source: f.source }]));
  const n8n = await notifyN8n({ event: `${journey}.submitted`, reference: result.id, journey, claimType: status.claimType || null, status: result.status, submittedAt: now, fields: safeFields, computed: { ...c, network: undefined }, simulated: true });
  if (saved) {
    try { updateSubmissionN8n(result.id, n8n.sent ? 'sent' : `not sent: ${n8n.reason || n8n.status}`); } catch {}
  }
  return NextResponse.json({ ...result, n8n, saved });
}
