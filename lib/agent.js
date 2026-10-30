// The Saral agent: turns one user turn (speech, text or a document photo) into form updates.
import { SCHEMAS, allFields, fieldDef } from './schemas';
import { evaluate, derive } from './rules';
import { composeReply } from './replies';
import { chatJSON, llmEnabled } from './llm';
import { mockExtractText, mockExtractDoc, mockAnswer } from './mockExtract';
import { detectLang, inr } from './format';
import policy from '@/data/policy.json';

function schemaForPrompt(schema) {
  return allFields(schema)
    .map((f) => `- ${f.key} (${f.type}${f.options ? `: one of ${f.options.join(' | ')}` : ''}) — ${f.label}`)
    .join('\n');
}

function currentValues(fields) {
  const o = {};
  for (const [k, v] of Object.entries(fields || {})) if (v?.value !== undefined && v?.value !== '') o[k] = v.value;
  return o;
}

const POLICY_FACTS = `Policy facts (only source for answering questions):
- Product: ${policy.productName}, sum insured ${inr(policy.sumInsured)}, used ${inr(policy.sumInsuredUsed)}
- Insured members: ${policy.insuredMembers.map((m) => `${m.name} (${m.relationship})`).join(', ')}
- Co-pay: ${policy.copayPercent}% on claims for ${policy.copayAppliesTo.join(' and ')} (the customer pays this share)
- Room rent cap: ${inr(policy.roomRentCapPerDay)} per day
- Claims must be filed within ${policy.claimWindowDays} days of discharge
- Not covered: ${policy.exclusions.join('; ')}
Loan offer facts: 16% interest a year, tenure 6–36 months, total EMIs may be at most 50% of monthly income, minimum income ₹15,000 a month, pre-check does not affect credit score.`;

async function llmExtractText(journey, schema, fields, text, pending, history) {
  const today = new Date().toISOString().slice(0, 10);
  const system = `You are the extraction engine of "Saral", an assistant that fills a "${schema.title}" form for a Paytm user in India.
The user speaks Hindi, English or Hinglish. Extract ONLY values the user actually stated in their latest message.
Today is ${today}. Convert dates to YYYY-MM-DD. Convert amounts to plain integers in rupees ("42 hazar" = 42000, "1.5 lakh" = 150000).
Map relatives to the enum (papa/pitaji → Father, maa/mummy → Mother, wife/husband/patni/pati → Spouse, khud/myself → Self).
"No EMI"/"koi EMI nahi" → existingEmi 0. Tenure in years → months.
If the latest message is a short answer, it answers the question Saral last asked (field: ${pending?.key || 'none'}).
Never guess or invent values. Never fill a field the user did not mention.

Form fields:
${schemaForPrompt(schema)}

${POLICY_FACTS}

Return JSON only:
{"updates":[{"field":"<key>","value":<string|number>,"confidence":<0..1>}],
 "lang":"hi"|"en",
 "answer": null | "<if the user asked a question, answer it in 1–2 short sentences using only the facts above, in the user's language; Hindi in Devanagari script>"}`;

  const msgs = [{ role: 'system', content: system }];
  for (const m of (history || []).slice(-6)) {
    msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
  }
  msgs.push({ role: 'user', content: `Current form values: ${JSON.stringify(currentValues(fields))}\n\nLatest user message: """${text}"""` });
  const out = await chatJSON(msgs);
  return {
    updates: Array.isArray(out.updates) ? out.updates : [],
    lang: out.lang === 'en' || out.lang === 'hi' ? out.lang : null,
    answer: typeof out.answer === 'string' && out.answer.trim() ? out.answer.trim() : null,
  };
}

async function llmExtractDoc(schema, imageDataUrl, expected) {
  const system = `You read photos of Indian hospital documents for an insurance claim and return structured data.
Classify the document as "hospitalBill" (final bill / invoice with amounts), "dischargeSummary" (discharge summary / discharge card) or "other".
Extract only what is clearly printed. Dates as YYYY-MM-DD. claimAmount = the final total payable in rupees as an integer.
Fields you may return: patientName, hospitalName, admissionDate, dischargeDate, diagnosis, claimAmount.
If the image is unreadable or not a medical document, return docType "other" and empty fields.
Return JSON only: {"docType":"hospitalBill"|"dischargeSummary"|"other","fields":{...},"confidence":<0..1>}`;
  const out = await chatJSON([
    { role: 'system', content: system },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Saral asked the user for: ${expected || 'a document'}. Read this photo.` },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ], { timeoutMs: 45000 });
  return { docType: out.docType, fields: out.fields || {}, confidence: Number(out.confidence) || 0.85 };
}

// Validate + normalise one value against the schema
function clean(def, value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (def.type === 'number') {
    const n = Number(String(value).replace(/[₹,\s]/g, ''));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
  }
  if (def.type === 'enum') {
    const hit = def.options.find((o) => o.toLowerCase() === String(value).toLowerCase());
    return hit;
  }
  if (def.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : undefined;
  if (def.key === 'pan') return String(value).toUpperCase().replace(/\s/g, '');
  return String(value).trim();
}

function applyUpdates(schema, fields, rawUpdates, source, lang) {
  const next = { ...fields };
  const applied = [];
  const conflicts = [];
  let matched = 0;
  for (const u of rawUpdates) {
    const def = fieldDef(schema, u.field);
    if (!def) continue;
    const value = clean(def, u.value);
    if (value === undefined) continue;
    const prev = next[u.field];
    if (prev && prev.value === value) {
      matched += 1;
      // what was said out loud is now confirmed by a document
      if (source === 'document' && ['voice', 'chat'].includes(prev.source)) next[u.field] = { ...prev, source: 'document', confidence: Math.max(prev.confidence || 0, 0.95) };
      continue;
    }
    // A document beats what was said out loud — tell the user when they differ
    if (source === 'document' && prev && ['voice', 'chat'].includes(prev.source) && def.type === 'number' && prev.value !== value) {
      conflicts.push({
        en: `You mentioned ${inr(prev.value)}, but the bill says ${inr(value)} — I've used the bill amount.`,
        hi: `आपने ${inr(prev.value)} बताया था, पर बिल में ${inr(value)} है — मैंने बिल वाली रकम ली है।`,
      });
    }
    // Don't let a document overwrite something the user typed/edited unless the field was empty
    if (source === 'document' && prev && prev.source === 'user') continue;
    next[u.field] = { value, source, confidence: Math.max(0, Math.min(1, Number(u.confidence) || 0.85)) };
    applied.push({ field: u.field, value });
  }
  return { fields: next, applied, conflicts, matched };
}

export async function runAgent({ journey, fields = {}, docs = {}, messages = [], text, mode = 'chat', image, fileName, lang = 'hi' }) {
  const schema = SCHEMAS[journey];
  if (!schema) throw new Error('unknown journey');
  const before = evaluate(journey, fields, docs);
  const pending = before.next;
  let replyLang = lang;
  let answer = null;
  let updates = [];
  let source = mode === 'voice' ? 'voice' : 'chat';
  let docKey = null;
  let unreadable = false;
  let usedAI = false;
  let newDocs = { ...docs };
  let docRecord = null; // for the database: what was read from the photo

  if (image) {
    source = 'document';
    const expected = pending?.kind === 'doc' ? pending.key : null;
    let ex;
    if (llmEnabled()) {
      try { ex = await llmExtractDoc(schema, image, expected); usedAI = true; }
      catch (e) { console.warn('[saral] doc AI failed, using mock:', e.message); ex = mockExtractDoc(fileName, expected); }
    } else {
      ex = mockExtractDoc(fileName, expected);
    }
    docRecord = { docType: ex?.docType || 'other', fileName, extracted: ex?.fields || {}, readBy: usedAI ? 'ai' : 'offline' };
    if (!ex || ex.docType === 'other' || !Object.keys(ex.fields || {}).length) {
      unreadable = true;
    } else {
      docKey = ex.docType;
      newDocs[docKey] = { name: fileName || docKey, at: new Date().toISOString() };
      updates = Object.entries(ex.fields).map(([field, value]) => ({ field, value, confidence: ex.confidence || 0.9 }));
    }
  } else if (text && text.trim()) {
    replyLang = detectLang(text) || lang;
    if (llmEnabled()) {
      try {
        const r = await llmExtractText(journey, schema, fields, text, pending, messages);
        updates = r.updates; answer = r.answer; usedAI = true;
        if (r.lang) replyLang = r.lang;
      } catch (e) {
        console.warn('[saral] text AI failed, using mock:', e.message);
        updates = mockExtractText(journey, text, pending);
        answer = mockAnswer(journey, text, replyLang);
      }
    } else {
      updates = mockExtractText(journey, text, pending);
      answer = mockAnswer(journey, text, replyLang);
    }
  }

  const merged = applyUpdates(schema, fields, updates, source, replyLang);
  const derived = derive(journey, merged.fields);
  const status = evaluate(journey, derived, newDocs);
  const reply = composeReply({ journey, lang: replyLang, updates: merged.applied, docKey, answer, conflicts: merged.conflicts, status, unreadable, matched: merged.matched });

  return {
    fields: derived,
    docs: newDocs,
    status,
    reply,
    lang: replyLang,
    changed: Object.keys(derived).filter((k) => derived[k] !== fields[k]),
    usedAI,
    docRecord,
  };
}
