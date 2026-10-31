// The Saral conversation engine — one engine for every journey.
// AI layer: understands the turn (fields, corrections, questions, which option the user picked).
// Rules layer (lib/rules.js): decides what applies, what's missing, issues, amounts and the next question.
import { SCHEMAS, allFields, fieldDef } from './schemas';
import { evaluate, derive } from './rules';
import { composeReply, docSummaryText, DOC_NAME, HI_LABEL } from './replies';
import { chatJSON, llmEnabled } from './llm';
import { mockExtractText, mockAnswer, detectChoice } from './mockExtract';
import { extractDocument, validateUpload, UNREADABLE } from './documents';
import { detectLang, inr, prettyDate } from './format';
import policy from '@/data/policy.json';
import loanCfg from '@/data/loan-config.json';

export const maskPan = (s) => String(s ?? '').replace(/\b([A-Z]{5})(\d{4})([A-Z])\b/gi, 'XXXXX$2X');

function schemaForPrompt(schema) {
  return allFields(schema)
    .map((f) => `- ${f.key} (${f.type}${f.options ? `: one of ${f.options.join(' | ')}` : ''}) — ${f.label}`)
    .join('\n');
}

function currentValues(schema, fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (v?.value === undefined || v.value === '') continue;
    o[k] = fieldDef(schema, k)?.sensitive ? '[provided]' : v.value; // never send PAN to the model
  }
  return o;
}

const FACTS = {
  health_claim: () => `Policy facts (the ONLY source for answering questions):
- ${policy.productName}; insurer ${policy.insurer}; TPA ${policy.tpa}; valid ${policy.startDate} to ${policy.endDate}
- Sum insured ${inr(policy.sumInsured)}, already used ${inr(policy.sumInsuredUsed)}
- Members: ${policy.insuredMembers.map((m) => `${m.name} (${m.relationship})`).join(', ')}
- Co-pay ${policy.copay.percent}% for ${policy.copay.appliesTo.join(' and ')}; room rent up to ${inr(policy.roomRentCapPerDay)}/day; deductible ${inr(policy.deductible)}
- Waiting periods: ${policy.waitingPeriods.map((w) => `${w.name} (${w.days} days)`).join('; ')}
- Exclusions: ${policy.exclusions.map((e) => e.name).join('; ')}
- Cashless: network hospitals only, needs pre-authorisation; emergency intimation within ${policy.claimRules.cashlessIntimationHours}h. Reimbursement: submit within ${policy.claimRules.reimbursementSubmissionDays} days of discharge.
Never promise approval or a final amount — the insurer decides.`,
  loan_precheck: () => `Loan facts (ILLUSTRATIVE demo terms, not a lender offer): ${loanCfg.interestRatePa}% a year, tenure ${loanCfg.tenureMonths.min}–${loanCfg.tenureMonths.max} months, amount ${inr(loanCfg.amount.min)}–${inr(loanCfg.amount.max)}, FOIR limit 50% salaried / 45% self-employed, processing fee ${loanCfg.processingFeePercent}% + GST. This check does not affect the credit score. Never say "approved" or "pre-approved".`,
};

async function llmUnderstand({ journey, schema, fields, text, pending, conflict, history }) {
  const today = new Date().toISOString().slice(0, 10);
  const system = `You are the language-understanding layer of "Saral", which fills a "${schema.title}" for a Paytm user in India.
The user writes or speaks Hindi, English or Hinglish. Extract ONLY values the user actually stated in their LATEST message.
- Today is ${today}. Dates → YYYY-MM-DD. Money → integer rupees ("42 hazar" = 42000, "1.5 lakh" = 150000, "₹3L" = 300000).
- Relatives → enum (papa/pitaji → Father, maa/mummy → Mother, wife/husband/patni/pati → Spouse, bhai → Brother, behen → Sister, khud/myself → Self).
- "abhi admit hai"/"still admitted" → admissionStatus "Currently admitted"; "discharge ho gaye"/"ghar aa gaye" → "Discharged".
- A cost given while the patient is still admitted is estimatedCost; a final bill after discharge is claimAmount.
- "No EMI" → existingEmi 0. Tenure in years → months. Experience in years → workExperienceYears.
- If the user corrects an earlier answer ("actually salary 50 hazar hai"), return the NEW value for that field.
- A short answer most likely answers Saral's last question (field: ${pending?.key || 'none'}).
- Extract several fields from one sentence when present. Never guess. Never fill a field the user didn't mention.
${conflict ? `- Saral just asked the user to choose for "${conflict.field}": ${conflict.options.map((o, i) => `option ${i} = ${JSON.stringify(o.value)} (${o.label})`).join(', ')}. If the latest message picks one, set "choice" to its index.` : ''}

Form fields:
${schemaForPrompt(schema)}

${FACTS[journey]()}

Return JSON only:
{"updates":[{"field":"<key>","value":<string|number>,"confidence":<0..1>}],
 "lang":"hi"|"en",
 "choice": null | <option index>,
 "answer": null | "<if the user asked a question, answer in 1–2 short sentences from the facts above only, in the user's language; Hindi in Devanagari>"}`;
  const msgs = [{ role: 'system', content: system }];
  for (const m of (history || []).slice(-6)) msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: maskPan(m.text) });
  msgs.push({ role: 'user', content: `Current form values: ${JSON.stringify(currentValues(schema, fields))}\n\nLatest user message: """${text}"""` });
  const out = await chatJSON(msgs);
  return {
    updates: Array.isArray(out.updates) ? out.updates : [],
    lang: out.lang === 'en' || out.lang === 'hi' ? out.lang : null,
    choice: Number.isInteger(out.choice) ? out.choice : null,
    answer: typeof out.answer === 'string' && out.answer.trim() ? out.answer.trim().slice(0, 600) : null,
  };
}

// --- validation of every AI/extracted value against the schema (structured output check)
const ENUM_SYNONYMS = {
  admissionStatus: { admitted: 'Currently admitted', 'still admitted': 'Currently admitted', 'currently admitted': 'Currently admitted', discharged: 'Discharged' },
  cashlessStatus: { rejected: 'Rejected', denied: 'Rejected', no: 'Not used', 'not used': 'Not used', 'not tried': 'Not used' },
  employmentType: { salaried: 'Salaried', 'self employed': 'Self-employed', 'self-employed': 'Self-employed', business: 'Self-employed' },
};
export function clean(def, value) {
  if (!def || value === undefined || value === null || value === '') return undefined;
  if (def.type === 'number') {
    const n = Number(String(value).replace(/[₹,\s]/g, ''));
    return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n) : undefined;
  }
  if (def.type === 'enum') {
    const s = String(value).trim().toLowerCase();
    return def.options.find((o) => o.toLowerCase() === s) || ENUM_SYNONYMS[def.key]?.[s];
  }
  if (def.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(value)) ? String(value) : undefined;
  if (def.key === 'pan') return String(value).toUpperCase().replace(/\s/g, '').slice(0, 12);
  if (def.key === 'pincode') { const d = String(value).replace(/\D/g, ''); return d.length ? d.slice(0, 6) : undefined; }
  if (def.key === 'mobile') { const d = String(value).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : undefined; }
  return String(value).trim().slice(0, 200);
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, ' ').replace(/\s+/g, ' ').trim();
function sameish(def, a, b) {
  if (a === b) return 'equal';
  if (def?.type === 'text') {
    const x = norm(a); const y = norm(b);
    if (x === y) return 'equal';
    if (x && y && (x.includes(y) || y.includes(x))) return 'refines'; // "Dengue" vs "Dengue fever with low platelets"
    const wx = new Set(x.split(' ').filter((w) => w.length > 4));
    if (def.key === 'diagnosis' && y.split(' ').some((w) => wx.has(w))) return 'refines';
  }
  return 'different';
}

const SOURCE_LABEL = { voice: 'You said', chat: 'You typed', user: 'You entered', account: 'Paytm account', policy: 'Policy', memory: 'Remembered', document: 'Document' };

function fmt(def, v) {
  if (def?.type === 'number') return def.key === 'tenureMonths' ? `${v} months` : inr(v);
  if (def?.type === 'date') return prettyDate(v);
  return String(v);
}

function conflictFor(schema, field, prev, incoming) {
  const def = fieldDef(schema, field);
  const lbl = (def?.label || field).replace(/\s*\(.*?\)\s*$/, '');
  const says = (o, lang) => {
    const v = fmt(def, o.value);
    if (lang === 'hi') {
      if (o.source === 'document') return `${DOC_NAME.hi[o.docType] || 'डॉक्यूमेंट'} में ${v} है`;
      if (['voice', 'chat', 'user'].includes(o.source)) return `आपने ${v} बताया था`;
      if (o.source === 'policy') return `पॉलिसी में ${v} है`;
      return `आपके अकाउंट में ${v} है`;
    }
    if (o.source === 'document') return `the ${DOC_NAME.en[o.docType] || 'document'} shows ${v}`;
    if (['voice', 'chat', 'user'].includes(o.source)) return `you mentioned ${v}`;
    if (o.source === 'policy') return `your policy has ${v}`;
    return `your Paytm account has ${v}`;
  };
  const tag = (o) => (o.source === 'document' ? `${(DOC_NAME.en[o.docType] || 'document').replace(/^./, (c) => c.toUpperCase())}` : SOURCE_LABEL[o.source] || o.source);
  const options = [
    { value: incoming.value, source: incoming.source, docType: incoming.docType, label: tag(incoming), display: fmt(def, incoming.value) },
    { value: prev.value, source: prev.source, docType: prev.docType, label: tag(prev), display: fmt(def, prev.value) },
  ];
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  return {
    field,
    label: lbl,
    options,
    question: {
      en: `${lbl}: ${cap(says(incoming, 'en'))}, while ${says(prev, 'en')}. Which one is correct?`,
      hi: `${HI_LABEL[field] || lbl}: ${says(incoming, 'hi')}, जबकि ${says(prev, 'hi')}। कौन सा सही है?`,
    },
  };
}

// Apply updates without silently overwriting: returns new fields, what changed, and at most one conflict to ask about
function applyUpdates(schema, fields, rawUpdates, meta) {
  const next = { ...fields };
  const applied = [];
  const conflicts = [];
  let matched = 0;
  for (const u of rawUpdates) {
    const def = fieldDef(schema, u.field);
    const value = clean(def, u.value);
    if (value === undefined) continue;
    const prev = next[u.field];
    const conf = Math.max(0, Math.min(1, Number(u.confidence) || 0.85));
    const incoming = { value, source: meta.source, confidence: conf, docType: meta.docType, docId: meta.docId, page: meta.page, verified: false };
    if (!prev || prev.value === undefined || prev.value === '') {
      next[u.field] = incoming; applied.push({ field: u.field, value }); continue;
    }
    const rel = sameish(def, prev.value, value);
    if (rel === 'equal') {
      matched += 1;
      if (meta.source === 'document' && prev.source !== 'document') next[u.field] = { ...prev, verified: true, confirmedBy: meta.docType, docId: meta.docId, page: meta.page };
      continue;
    }
    if (meta.source === 'document') {
      if (rel === 'refines' && prev.source !== 'document') { next[u.field] = incoming; matched += 1; continue; }
      if (prev.source === 'user' && prev.verified) { conflicts.push(conflictFor(schema, u.field, prev, incoming)); continue; }
      conflicts.push(conflictFor(schema, u.field, prev, incoming));
      continue;
    }
    // user said something new
    if (prev.source === 'document' || prev.verified) { conflicts.push(conflictFor(schema, u.field, prev, incoming)); continue; }
    next[u.field] = incoming; // a correction of something they said earlier
    applied.push({ field: u.field, value });
  }
  return { fields: next, applied, conflicts, matched };
}

const COMPARE = ['patientName', 'hospitalName', 'admissionDate', 'dischargeDate', 'diagnosis', 'claimAmount'];
function compareDocs(schema, a, aType, b, bType) {
  const rows = [];
  for (const k of COMPARE) {
    const def = fieldDef(schema, k);
    const x = a?.[k]; const y = b?.[k];
    if ((x === undefined || x === null || x === '') && (y === undefined || y === null || y === '')) continue;
    let status;
    if (x === undefined || x === null || x === '' || y === undefined || y === null || y === '') status = 'missing';
    else status = sameish(def, clean(def, x), clean(def, y)) === 'different' ? 'mismatch' : 'match';
    rows.push({ field: k, label: def?.label || k, a: x ?? null, b: y ?? null, status, fmtA: x != null && x !== '' ? fmt(def, clean(def, x) ?? x) : '—', fmtB: y != null && y !== '' ? fmt(def, clean(def, y) ?? y) : '—' });
  }
  return { type: 'comparison', aLabel: DOC_NAME.en[aType], bLabel: DOC_NAME.en[bType], rows };
}

function resolveConflict(fields, conflict, idx) {
  const opt = conflict.options[idx];
  if (!opt) return null;
  return { ...fields, [conflict.field]: { value: opt.value, source: opt.source, docType: opt.docType, confidence: 1, verified: true, confirmedBy: 'user' } };
}

export async function runAgent({ journey, fields = {}, docs = {}, messages = [], text, mode = 'chat', file, lang = 'hi', pending = null, choice = null }) {
  const schema = SCHEMAS[journey];
  if (!schema) throw new Error('unknown journey');
  const prevStatus = evaluate(journey, fields, docs);
  let replyLang = lang;
  let answer = null;
  let usedAI = false;
  let newDocs = { ...docs };
  let docRecord = null;
  let docSummary = null;
  let unreadable = null;
  const cards = [];
  let merged = { fields, applied: [], conflicts: [], matched: 0 };
  let conflict = pending;
  let resolvedNote = null;

  // 1) The user tapped an option for an open question
  if (pending && Number.isInteger(choice)) {
    const f = resolveConflict(fields, pending, choice);
    if (f) {
      const def = fieldDef(schema, pending.field);
      const o = pending.options[choice];
      merged = { fields: f, applied: [], conflicts: [], matched: 0 };
      resolvedNote = { en: `Okay — using ${fmt(def, o.value)} (${o.label.toLowerCase()}) for the ${def?.label?.toLowerCase()}.`, hi: `ठीक है — ${def?.label}: ${fmt(def, o.value)} रखा।` };
      conflict = pending.queue?.length ? { ...pending.queue[0], queue: pending.queue.slice(1) } : null;
    }
  } else if (file?.dataUrl) {
    // 2) A document
    const check = validateUpload(file.dataUrl, file.name);
    if (!check.ok) {
      unreadable = { en: check.error, hi: check.error };
    } else {
      const expected = prevStatus.next?.kind === 'doc' ? prevStatus.next.key : null;
      const ex = await extractDocument({ dataUrl: file.dataUrl, fileName: file.name, mime: check.mime, expected });
      usedAI = ex.readBy === 'ai';
      const docId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      docRecord = { docId, docType: ex.docType || 'other', fileName: file.name, extracted: ex.error ? {} : { ...ex.fields, ...ex.extra }, readBy: ex.error ? 'not_read' : ex.readBy, page: ex.page || null, error: ex.reason || null };
      if (ex.error) unreadable = UNREADABLE[ex.reason];
      else if (ex.docType === 'other' || !Object.keys(ex.fields || {}).length) unreadable = UNREADABLE.other;
      else {
        const docKey = schema.documents.some((d) => d.key === ex.docType) ? ex.docType : 'other';
        const prevDoc = docKey === 'dischargeSummary' ? newDocs.hospitalBill : docKey === 'hospitalBill' ? newDocs.dischargeSummary : null;
        newDocs[docKey] = { id: docId, name: file.name, at: new Date().toISOString(), readBy: ex.readBy, page: ex.page || null, extracted: { ...ex.fields, ...ex.extra } };
        const updates = Object.entries(ex.fields).map(([field, value]) => ({ field, value, confidence: ex.confidence }));
        merged = applyUpdates(schema, fields, updates, { source: 'document', docType: docKey, docId, page: ex.page || null });
        const found = Object.fromEntries(Object.entries(ex.fields).filter(([k, v]) => fieldDef(schema, k) && v !== null && v !== ''));
        const member = found.patientName ? policy.insuredMembers.some((m) => norm(m.name) === norm(found.patientName)) : undefined;
        docSummary = { en: docSummaryText('en', docKey, found, member), hi: docSummaryText('hi', docKey, found, member) };
        cards.push({
          type: 'extracted', docType: docKey, docId, fileName: file.name, readBy: ex.readBy, page: ex.page || null,
          fields: Object.entries(found).map(([k, v]) => ({ key: k, label: fieldDef(schema, k).label, value: fmt(fieldDef(schema, k), clean(fieldDef(schema, k), v) ?? v) })),
          lineItems: ex.extra?.lineItems || [],
        });
        if (prevDoc?.extracted && (docKey === 'dischargeSummary' || docKey === 'hospitalBill')) {
          const cmp = docKey === 'dischargeSummary'
            ? compareDocs(schema, prevDoc.extracted, 'hospitalBill', ex.fields, 'dischargeSummary')
            : compareDocs(schema, ex.fields, 'hospitalBill', prevDoc.extracted, 'dischargeSummary');
          cards.push(cmp);
          const mm = cmp.rows.filter((r) => r.status === 'mismatch').length;
          const ok = cmp.rows.filter((r) => r.status === 'match').length;
          docSummary.en += ` Compared with the ${docKey === 'dischargeSummary' ? 'bill' : 'discharge summary'}: ${ok} match${mm ? `, ${mm} don't` : ' ✓'}.`;
          docSummary.hi += ` ${docKey === 'dischargeSummary' ? 'बिल' : 'डिस्चार्ज समरी'} से मिलाया: ${ok} मेल खाते हैं${mm ? `, ${mm} नहीं` : ' ✓'}।`;
        }
        if (merged.conflicts.length) conflict = { ...merged.conflicts[0], queue: merged.conflicts.slice(1) };
      }
    }
  } else if (text && text.trim()) {
    // 3) Speech or text
    replyLang = detectLang(text) || lang;
    let picked = null;
    let updates = [];
    if (llmEnabled()) {
      try {
        const r = await llmUnderstand({ journey, schema, fields, text, pending: prevStatus.next, conflict: pending, history: messages });
        updates = r.updates; answer = r.answer; picked = r.choice; usedAI = true;
        if (r.lang) replyLang = r.lang;
      } catch (e) {
        console.warn('[saral] text AI failed, using offline extractor:', e.message);
      }
    }
    if (!usedAI) {
      updates = mockExtractText(journey, text, prevStatus.next);
      answer = mockAnswer(journey, text, replyLang);
      if (pending) {
        const c = detectChoice(text);
        const docIdx = pending.options.findIndex((o) => o.source === 'document');
        if (c === 'document' && docIdx >= 0) picked = docIdx;
        else if (c === 'user') picked = pending.options.findIndex((o) => o.source !== 'document');
      }
    }
    if (pending && Number.isInteger(picked) && picked >= 0) {
      const f = resolveConflict(fields, pending, picked);
      const def = fieldDef(schema, pending.field);
      const o = pending.options[picked];
      merged = { fields: f, applied: [], conflicts: [], matched: 0 };
      resolvedNote = { en: `Okay — using ${fmt(def, o.value)} for the ${def?.label?.toLowerCase()}.`, hi: `ठीक है — ${def?.label}: ${fmt(def, o.value)} रखा।` };
      conflict = pending.queue?.length ? { ...pending.queue[0], queue: pending.queue.slice(1) } : null;
      updates = updates.filter((u) => u.field !== pending.field);
      if (updates.length) {
        const m2 = applyUpdates(schema, merged.fields, updates, { source: mode === 'voice' ? 'voice' : 'chat' });
        merged = m2;
      }
    } else {
      merged = applyUpdates(schema, fields, updates, { source: mode === 'voice' ? 'voice' : 'chat' });
      if (merged.conflicts.length) conflict = { ...merged.conflicts[0], queue: merged.conflicts.slice(1) };
    }
  }

  const derived = derive(journey, merged.fields);
  const status = evaluate(journey, derived, newDocs);
  if (conflict) {
    status.complete = false;
    status.next = { kind: 'conflict', key: conflict.field };
  }
  let reply = composeReply({ journey, lang: replyLang, updates: merged.applied, prevFields: fields, prevStatus, status, answer, docSummary, conflict, unreadable });
  if (resolvedNote) reply = `${resolvedNote[replyLang] || resolvedNote.en} ${reply.replace(/^(Got it[^.]*\.|ठीक है[^।]*।)\s*/, '')}`;

  return {
    fields: derived,
    docs: newDocs,
    status,
    reply,
    lang: replyLang,
    changed: Object.keys(derived).filter((k) => derived[k] !== fields[k]),
    usedAI,
    docRecord,
    cards,
    pending: conflict,
  };
}
