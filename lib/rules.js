// Deterministic rules. The AI only extracts values — every check and every rupee is computed here.
import { SCHEMAS, allFields } from './schemas';
import { inr, prettyDate } from './format';
import policy from '@/data/policy.json';

const LOAN_RATE_PA = 16; // % per year, demo offer
const FOIR_LIMIT = 0.5; // total EMIs may use at most 50% of income
const MIN_INCOME = 15000;

// Order in which Saral asks for things. 'doc:x' = ask for a document photo.
const ASK_ORDER = {
  health_claim: ['relationship', 'patientName', 'doc:hospitalBill', 'hospitalName', 'admissionDate', 'dischargeDate', 'diagnosis', 'claimAmount', 'doc:dischargeSummary', 'upiId', 'policyNumber', 'policyHolder'],
  loan_precheck: ['loanAmount', 'employmentType', 'monthlyIncome', 'existingEmi', 'tenureMonths', 'pan', 'fullName', 'mobile', 'disbursalUpi'],
};

// Fields the hospital bill photo will fill — while the bill is missing, ask for the photo instead of each one.
const BILL_FIELDS = ['hospitalName', 'admissionDate', 'dischargeDate', 'diagnosis', 'claimAmount'];

const has = (fields, k) => {
  const v = fields?.[k]?.value;
  return v !== undefined && v !== null && v !== '';
};
const val = (fields, k) => fields?.[k]?.value;

export function emi(principal, months, ratePa = LOAN_RATE_PA) {
  const r = ratePa / 12 / 100;
  if (!principal || !months) return 0;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

function principalForEmi(emiAmount, months, ratePa = LOAN_RATE_PA) {
  const r = ratePa / 12 / 100;
  if (emiAmount <= 0 || !months) return 0;
  return (emiAmount * (Math.pow(1 + r, months) - 1)) / (r * Math.pow(1 + r, months));
}

function daysBetween(aIso, bIso) {
  return Math.round((new Date(bIso) - new Date(aIso)) / 86400000);
}

// Fill values that follow from others (e.g. "papa" + policy → patient name).
export function derive(journey, fields) {
  const out = { ...fields };
  if (journey === 'health_claim') {
    if (has(out, 'relationship') && !has(out, 'patientName')) {
      const m = policy.insuredMembers.find((x) => x.relationship === val(out, 'relationship'));
      if (m) out.patientName = { value: m.name, source: 'account', confidence: 0.95 };
    }
    if (has(out, 'patientName') && !has(out, 'relationship')) {
      const name = String(val(out, 'patientName')).toLowerCase();
      const m = policy.insuredMembers.find((x) => x.name.toLowerCase() === name);
      if (m) out.relationship = { value: m.relationship, source: 'account', confidence: 0.95 };
    }
  }
  return out;
}

export function evaluate(journey, fields, docs = {}) {
  const schema = SCHEMAS[journey];
  const required = allFields(schema).filter((f) => f.required).map((f) => f.key);
  const missingFields = required.filter((k) => !has(fields, k));
  const missingDocs = schema.documents.filter((d) => d.required && !docs[d.key]).map((d) => d.key);
  const warnings = [];
  const explain = { en: [], hi: [] };
  let computed = {};

  if (journey === 'health_claim') {
    const rel = val(fields, 'relationship');
    const name = val(fields, 'patientName');
    if (name) {
      const insured = policy.insuredMembers.some((m) => m.name.toLowerCase() === String(name).toLowerCase());
      if (!insured) warnings.push({ en: `${name} is not listed as an insured member on this policy.`, hi: `${name} इस पॉलिसी में कवर्ड सदस्य के रूप में दर्ज नहीं हैं।` });
    }
    const adm = val(fields, 'admissionDate');
    const dis = val(fields, 'dischargeDate');
    if (adm && dis && daysBetween(adm, dis) < 0) warnings.push({ en: 'Discharge date is before the admission date.', hi: 'डिस्चार्ज की तारीख़ भर्ती की तारीख़ से पहले है।' });
    if (dis) {
      const today = new Date().toISOString().slice(0, 10);
      const since = daysBetween(dis, today);
      if (since < 0) warnings.push({ en: 'Discharge date is in the future.', hi: 'डिस्चार्ज की तारीख़ आगे की है।' });
      else if (since > policy.claimWindowDays) warnings.push({ en: `Claims must be filed within ${policy.claimWindowDays} days of discharge — this is ${since} days.`, hi: `क्लेम डिस्चार्ज के ${policy.claimWindowDays} दिन के अंदर करना होता है — अभी ${since} दिन हो चुके हैं।` });
    }
    const amount = Number(val(fields, 'claimAmount'));
    if (amount > 0) {
      const remaining = policy.sumInsured - policy.sumInsuredUsed;
      const admissible = Math.min(amount, remaining);
      const copayApplies = rel ? policy.copayAppliesTo.includes(rel) : false;
      const copay = copayApplies ? Math.round((admissible * policy.copayPercent) / 100) : 0;
      const payout = admissible - copay;
      computed = { amount, admissible, copay, copayApplies, payout, remaining };
      if (amount > remaining) warnings.push({ en: `Claim is above your remaining cover of ${inr(remaining)}.`, hi: `क्लेम आपके बचे हुए कवर ${inr(remaining)} से ज़्यादा है।` });
      explain.en.push(`Bill amount: ${inr(amount)}`);
      explain.hi.push(`बिल की रकम: ${inr(amount)}`);
      if (copayApplies) {
        explain.en.push(`${policy.copayPercent}% co-pay applies for parents: you pay ${inr(copay)}`);
        explain.hi.push(`माता-पिता के क्लेम पर ${policy.copayPercent}% को-पे: ${inr(copay)} आपको देना होगा`);
      } else if (rel) {
        explain.en.push('No co-pay for this family member');
        explain.hi.push('इस सदस्य पर कोई को-पे नहीं');
      }
      explain.en.push(`Estimated payout: ${inr(payout)}`);
      explain.hi.push(`अनुमानित भुगतान: ${inr(payout)}`);
    }
  }

  if (journey === 'loan_precheck') {
    const income = Number(val(fields, 'monthlyIncome'));
    const existing = Number(val(fields, 'existingEmi') || 0);
    const amount = Number(val(fields, 'loanAmount'));
    const months = Number(val(fields, 'tenureMonths'));
    const pan = val(fields, 'pan');
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(pan).toUpperCase())) warnings.push({ en: 'PAN format looks wrong (should be like ABCDE1234F).', hi: 'PAN का फ़ॉर्मेट सही नहीं लग रहा (जैसे ABCDE1234F होना चाहिए)।' });
    if (income > 0 && amount > 0 && months > 0 && has(fields, 'existingEmi')) {
      const newEmi = emi(amount, months);
      const maxEmi = income * FOIR_LIMIT - existing;
      const maxAmount = Math.max(0, Math.floor(principalForEmi(maxEmi, months) / 1000) * 1000);
      const eligible = income >= MIN_INCOME && newEmi <= maxEmi;
      computed = { newEmi: Math.round(newEmi), maxEmi: Math.round(maxEmi), maxAmount, eligible, rate: LOAN_RATE_PA, foir: Math.round(((existing + newEmi) / income) * 100) };
      explain.en.push(`EMI for ${inr(amount)} over ${months} months at ${LOAN_RATE_PA}% a year: ${inr(newEmi)}`);
      explain.hi.push(`${inr(amount)} का लोन, ${months} महीने, ${LOAN_RATE_PA}% सालाना ब्याज: EMI ${inr(newEmi)}`);
      explain.en.push(`All EMIs together would use ${computed.foir}% of your income (limit ${FOIR_LIMIT * 100}%)`);
      explain.hi.push(`सारी EMI मिलाकर आपकी आय का ${computed.foir}% होगा (सीमा ${FOIR_LIMIT * 100}%)`);
      if (!eligible) {
        if (income < MIN_INCOME) {
          explain.en.push(`Minimum income for this offer is ${inr(MIN_INCOME)} a month`);
          explain.hi.push(`इस ऑफ़र के लिए कम से कम ${inr(MIN_INCOME)} महीने की आय चाहिए`);
        } else {
          explain.en.push(`You can borrow up to about ${inr(maxAmount)} for ${months} months`);
          explain.hi.push(`${months} महीने के लिए आप लगभग ${inr(maxAmount)} तक ले सकते हैं`);
        }
      }
    }
  }

  // What to ask next
  let next = null;
  for (const item of ASK_ORDER[journey]) {
    if (item.startsWith('doc:')) {
      const d = item.slice(4);
      if (missingDocs.includes(d)) { next = { kind: 'doc', key: d }; break; }
    } else if (missingFields.includes(item)) {
      if (journey === 'health_claim' && BILL_FIELDS.includes(item) && missingDocs.includes('hospitalBill')) {
        next = { kind: 'doc', key: 'hospitalBill' }; break;
      }
      next = { kind: 'field', key: item }; break;
    }
  }

  return {
    missingFields,
    missingDocs,
    warnings,
    explain,
    computed,
    next,
    complete: missingFields.length === 0 && missingDocs.length === 0,
  };
}

export { prettyDate };
