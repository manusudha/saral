import { NextResponse } from 'next/server';
import { evaluate } from '@/lib/rules';
import { remember } from '@/lib/memory';
import { sessionExists, saveSubmission, updateSubmissionN8n, logMessage } from '@/lib/db';

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

export async function POST(req) {
  const { journey, fields, docs, sessionId } = await req.json();
  const status = evaluate(journey, fields, docs);
  if (!status.complete) return NextResponse.json({ error: 'Form is not complete', status }, { status: 400 });
  const v = (k) => fields[k]?.value;
  const now = new Date().toISOString();
  const aiFilled = Object.entries(fields).filter(([, f]) => ['voice', 'chat', 'document'].includes(f.source)).length;

  let result;
  if (journey === 'health_claim') {
    const id = ref('CLM');
    remember({ fullName: v('policyHolder'), upiId: v('upiId') }, sessionId);
    result = {
      id,
      status: 'Under insurer review',
      headline: 'Claim submitted',
      amountLabel: 'Estimated payout',
      amount: status.computed.payout,
      timeline: [
        { label: 'Claim submitted', detail: 'All details and documents received', state: 'done', at: now },
        { label: 'Documents checked by Saral', detail: `${aiFilled} fields read from your voice and documents`, state: 'done', at: now },
        { label: 'Insurer review', detail: 'Usually within 2 working days', state: 'current' },
        { label: `Payout to ${v('upiId')}`, detail: 'Within 7 days of approval', state: 'todo' },
      ],
    };
  } else {
    const id = ref('LPC');
    remember({ fullName: v('fullName'), pan: v('pan'), upiId: v('disbursalUpi') }, sessionId);
    const c = status.computed;
    result = {
      id,
      status: c.eligible ? 'Pre-approved' : 'Lower amount suggested',
      headline: c.eligible ? 'You are pre-approved' : 'Pre-check complete',
      amountLabel: c.eligible ? 'Monthly EMI' : 'You can borrow up to',
      amount: c.eligible ? c.newEmi : c.maxAmount,
      timeline: [
        { label: 'Details checked', detail: 'No impact on your credit score', state: 'done', at: now },
        { label: c.eligible ? 'Offer ready' : 'Lower amount suggested', detail: c.eligible ? `${v('tenureMonths')} months at ${c.rate}% a year` : 'Change the amount to continue', state: 'current' },
        { label: `Money to ${v('disbursalUpi')}`, detail: 'After you accept the offer and complete KYC', state: 'todo' },
      ],
    };
  }

  // Save to the database first, so the record exists even if n8n is slow or down
  let saved = false;
  try {
    if (sessionExists(sessionId)) {
      saveSubmission({ ...result, sessionId, journey, fields, computed: status.computed, n8nStatus: 'pending' });
      saved = true;
    }
  } catch (e) {
    console.error('[saral] db error on submit', e);
  }

  const n8n = await notifyN8n({ event: `${journey}.submitted`, reference: result.id, journey, submittedAt: now, fields: Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { value: f.value, source: f.source }])), computed: status.computed });
  if (saved) {
    try { updateSubmissionN8n(result.id, n8n.sent ? 'sent' : `not sent: ${n8n.reason || n8n.status}`); } catch {}
  }
  return NextResponse.json({ ...result, n8n, saved });
}
