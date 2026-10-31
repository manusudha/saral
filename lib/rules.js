// Business rules layer. Deterministic — the AI never decides eligibility, coverage or amounts.
// evaluate() is the single source of truth for: which fields apply, what's missing, validation issues,
// claim type (cashless / reimbursement), the payout or EMI breakdown, and what Saral should ask next.
import { SCHEMAS, allFields } from './schemas';
import { inr, prettyDate } from './format';
import { lookupHospital } from './network';
import defaultPolicy from '@/data/policy.json';
import loanCfg from '@/data/loan-config.json';

const has = (f, k) => {
  const v = f?.[k]?.value;
  return v !== undefined && v !== null && v !== '';
};
const val = (f, k) => f?.[k]?.value;
const lc = (s) => String(s || '').toLowerCase();
const DAY = 86400000;
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const todayIso = (ctx) => (ctx?.today || new Date().toISOString().slice(0, 10));

// ---------- loan maths ----------
export function emi(principal, months, ratePa = loanCfg.interestRatePa) {
  const r = ratePa / 12 / 100;
  if (!principal || !months) return 0;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}
export function principalForEmi(emiAmount, months, ratePa = loanCfg.interestRatePa) {
  const r = ratePa / 12 / 100;
  if (emiAmount <= 0 || !months) return 0;
  return (emiAmount * (Math.pow(1 + r, months) - 1)) / (r * Math.pow(1 + r, months));
}
function ageOn(dobIso, today) {
  const d = toDate(dobIso);
  const t = toDate(today);
  let a = t.getUTCFullYear() - d.getUTCFullYear();
  if (t.getUTCMonth() < d.getUTCMonth() || (t.getUTCMonth() === d.getUTCMonth() && t.getUTCDate() < d.getUTCDate())) a -= 1;
  return a;
}

const PIN_CITY = { 400: 'Mumbai', 401: 'Thane', 410: 'Navi Mumbai', 411: 'Pune', 110: 'Delhi', 122: 'Gurugram', 201: 'Noida', 560: 'Bengaluru', 600: 'Chennai', 500: 'Hyderabad', 700: 'Kolkata', 380: 'Ahmedabad', 302: 'Jaipur', 226: 'Lucknow' };

// Values that follow from others (e.g. "papa" + the policy's member list → patient name)
export function derive(journey, fields, policy = defaultPolicy) {
  const out = { ...fields };
  if (journey === 'health_claim') {
    if (has(out, 'relationship') && !has(out, 'patientName')) {
      const m = (policy.insuredMembers || []).find((x) => x.relationship === val(out, 'relationship'));
      if (m) out.patientName = { value: m.name, source: 'policy', confidence: 0.95 };
    }
    if (has(out, 'patientName') && !has(out, 'relationship')) {
      const m = (policy.insuredMembers || []).find((x) => lc(x.name) === lc(val(out, 'patientName')));
      if (m) out.relationship = { value: m.relationship, source: 'policy', confidence: 0.95 };
    }
    // A cost mentioned while the patient is still admitted is an estimate, not a final bill
    if (val(out, 'admissionStatus') === 'Currently admitted' && has(out, 'claimAmount') && ['voice', 'chat'].includes(out.claimAmount.source) && !has(out, 'estimatedCost')) {
      out.estimatedCost = { ...out.claimAmount };
      delete out.claimAmount;
    }
  }
  if (journey === 'loan_precheck') {
    const pin = String(val(out, 'pincode') || '');
    if (/^\d{6}$/.test(pin) && !has(out, 'city')) {
      const city = PIN_CITY[pin.slice(0, 3)];
      if (city) out.city = { value: city, source: out.pincode.source === 'user' ? 'user' : out.pincode.source, confidence: 0.9 };
    }
  }
  return out;
}

// ================= HEALTH INSURANCE =================
function evaluateClaim(fields, docs, ctx) {
  const policy = ctx?.policy || defaultPolicy;
  const today = todayIso(ctx);
  const issues = [];
  const add = (id, severity, en, hi, field) => issues.push({ id, severity, en, hi, field });

  const rel = val(fields, 'relationship');
  const name = val(fields, 'patientName');
  const status = val(fields, 'admissionStatus');
  const adm = val(fields, 'admissionDate');
  const dis = val(fields, 'dischargeDate');
  const diagnosis = lc(val(fields, 'diagnosis'));

  // --- policy status (never assume active just because a number exists)
  if (policy.status !== 'active') add('policy_inactive', 'block', `This policy is ${policy.status}. A claim can't be filed on it.`, `यह पॉलिसी ${policy.status} है, इस पर क्लेम नहीं हो सकता।`);
  if (today > policy.endDate) add('policy_expired', 'block', `Your policy expired on ${prettyDate(policy.endDate)}.`, `आपकी पॉलिसी ${prettyDate(policy.endDate)} को ख़त्म हो चुकी है।`);
  if (adm && (adm < policy.startDate || adm > policy.endDate)) {
    add('policy_not_active_on_admission', 'block', `The policy wasn't active on the admission date (${prettyDate(adm)}). It runs ${prettyDate(policy.startDate)} – ${prettyDate(policy.endDate)}.`, `भर्ती की तारीख़ (${prettyDate(adm)}) पर पॉलिसी चालू नहीं थी।`, 'admissionDate');
  }

  // --- covered member
  const members = policy.insuredMembers || [];
  const member = members.find((m) => (name && lc(m.name) === lc(name)) || (!name && rel && m.relationship === rel)) ||
    (rel && members.find((m) => m.relationship === rel));
  if (members.length && rel && !members.some((m) => m.relationship === rel)) {
    const who = { Brother: 'brother', Sister: 'sister', Son: 'son', Daughter: 'daughter', Other: 'this person' }[rel] || rel.toLowerCase();
    const whoHi = { Brother: 'भाई', Sister: 'बहन', Son: 'बेटा', Daughter: 'बेटी' }[rel] || 'इन';
    add('member_not_covered', 'block', `I couldn't find your ${who} in this policy's covered members (${policy.insuredMembers.map((m) => m.relationship).join(', ')}). Is there another policy that covers them?`, `इस पॉलिसी में आपके ${whoHi} का नाम कवर्ड सदस्यों में नहीं है। क्या उनकी कोई और पॉलिसी है?`, 'relationship');
  } else if (members.length && name && !members.some((m) => lc(m.name) === lc(name))) {
    add('name_not_on_policy', 'warn', `“${name}” doesn't exactly match a member name on the policy (${policy.insuredMembers.map((m) => m.name).join(', ')}). Please confirm the patient's name.`, `“${name}” पॉलिसी के किसी सदस्य के नाम से मेल नहीं खाता। कृपया नाम कन्फ़र्म करें।`, 'patientName');
  }

  // --- dates
  if (adm && adm > today) add('admission_future', 'block', 'The admission date is in the future. Could you check it?', 'भर्ती की तारीख़ आगे की है, कृपया जाँच लें।', 'admissionDate');
  if (dis && dis > today) add('discharge_future', 'block', 'The discharge date is in the future. Could you check it?', 'डिस्चार्ज की तारीख़ आगे की है, कृपया जाँच लें।', 'dischargeDate');
  if (adm && dis && dis < adm) add('dates_reversed', 'block', `The discharge date (${prettyDate(dis)}) is earlier than the admission date (${prettyDate(adm)}). Could you confirm the correct dates?`, `डिस्चार्ज की तारीख़ (${prettyDate(dis)}) भर्ती (${prettyDate(adm)}) से पहले है। सही तारीख़ें बताइए।`, 'dischargeDate');

  // --- network lookup → claim type
  let network = null;
  if (has(fields, 'hospitalName')) network = lookupHospital({ name: val(fields, 'hospitalName'), city: val(fields, 'hospitalCity'), networkId: policy.networkId });
  let claimType = null;
  if (status === 'Discharged') claimType = 'reimbursement';
  else if (status === 'Currently admitted' && !['need_city', 'ambiguous'].includes(network?.status)) claimType = network?.status === 'network' ? 'cashless' : 'intimation';

  if (claimType === 'cashless' && adm) {
    const hrs = daysBetween(adm, today) * 24;
    if (hrs > policy.claimRules.cashlessIntimationHours) add('cashless_late_intimation', 'warn', `For emergencies the insurer should be told within ${policy.claimRules.cashlessIntimationHours} hours of admission. Ask the hospital's insurance desk to send the pre-authorisation today.`, `इमरजेंसी में ${policy.claimRules.cashlessIntimationHours} घंटे के अंदर बीमा कंपनी को बताना होता है। आज ही अस्पताल के इंश्योरेंस डेस्क से प्री-ऑथ भिजवाइए।`, 'admissionDate');
  }
  if (claimType === 'reimbursement' && dis && dis <= today) {
    const since = daysBetween(dis, today);
    const limit = policy.claimRules.reimbursementSubmissionDays;
    if (since > limit) add('submission_late', 'warn', `This policy asks for reimbursement claims within ${limit} days of discharge — it's been ${since} days. You can still submit, but add the reason for the delay; the insurer decides whether to accept it.`, `इस पॉलिसी में डिस्चार्ज के ${limit} दिन के अंदर क्लेम करना होता है — ${since} दिन हो गए हैं। फिर भी सबमिट कर सकते हैं, देरी की वजह लिखें।`, 'dischargeDate');
  }

  // --- waiting periods and exclusions: flagged for insurer review, never decided here
  if (member && adm && diagnosis) {
    const coveredDays = daysBetween(member.coveredSince, adm);
    const accident = /accident|injury|fracture|durghatna|chot/.test(diagnosis);
    for (const wp of policy.waitingPeriods) {
      const applies = wp.appliesTo === 'all' ? !(wp.exceptAccident && accident) : (wp.keywords || []).some((k) => diagnosis.includes(k));
      if (applies && coveredDays < wp.days) {
        add(`waiting_${wp.days}`, 'warn', `${wp.name}: ${member.name} has been covered for ${coveredDays} days (needs ${wp.days}). The insurer will review whether this treatment is payable.`, `${wp.name}: ${member.name} को कवर हुए ${coveredDays} दिन हुए हैं (${wp.days} चाहिए)। बीमा कंपनी जाँच करेगी।`, 'diagnosis');
      }
    }
  }
  if (diagnosis) {
    for (const ex of policy.exclusions) {
      if (ex.keywords.some((k) => diagnosis.includes(k))) add(`exclusion_${ex.keywords[0]}`, 'warn', `“${val(fields, 'diagnosis')}” may fall under the exclusion “${ex.name}”. The insurer will decide — I've flagged it for review.`, `“${val(fields, 'diagnosis')}” शायद “${ex.name}” में आता है। फ़ैसला बीमा कंपनी करेगी।`, 'diagnosis');
    }
  }

  // --- what applies / is required
  const applicable = ['policyNumber', 'policyHolder', 'relationship', 'patientName', 'hospitalName', 'hospitalCity', 'admissionStatus'];
  const required = [...applicable];
  let requiredDocs = [];
  let optionalDocs = [];
  if (status === 'Discharged') {
    applicable.push('admissionDate', 'dischargeDate', 'diagnosis', 'claimAmount', 'upiId');
    required.push('admissionDate', 'dischargeDate', 'diagnosis', 'claimAmount', 'upiId');
    requiredDocs = [...policy.claimRules.reimbursementDocuments];
    optionalDocs = [...policy.claimRules.optionalDocuments];
    if (network?.status === 'network') { applicable.push('cashlessStatus'); required.push('cashlessStatus'); }
    if (val(fields, 'cashlessStatus') === 'Rejected') {
      applicable.push('cashlessRejectionReason'); required.push('cashlessRejectionReason');
      optionalDocs.unshift('rejectionLetter');
    }
  } else if (status === 'Currently admitted') {
    applicable.push('admissionDate', 'diagnosis', 'estimatedCost');
    required.push('admissionDate', 'diagnosis', 'estimatedCost');
    if (claimType === 'cashless') optionalDocs = ['preAuthForm', 'prescription', 'diagnosticReport'];
  }
  const missingFields = required.filter((k) => !has(fields, k));
  const missingDocs = requiredDocs.filter((d) => !docs?.[d]);

  // --- payout estimate
  const breakdown = [];
  const explain = { en: [], hi: [] };
  let computed = { claimType, network };
  const base = claimType === 'reimbursement' ? Number(val(fields, 'claimAmount')) : Number(val(fields, 'estimatedCost'));
  if (base > 0 && claimType) {
    const billX = docs?.hospitalBill?.extracted || {};
    const lines = Array.isArray(billX.lineItems) ? billX.lineItems : [];
    breakdown.push({ label: claimType === 'reimbursement' ? 'Final bill' : 'Estimated treatment cost', amount: base, kind: 'base' });

    const nonPayable = lines.filter((li) => policy.nonPayableKeywords.some((k) => lc(li.description).includes(k)));
    const nonPayableAmt = nonPayable.reduce((s, li) => s + (Number(li.amount) || 0), 0);
    if (nonPayableAmt > 0) breakdown.push({ label: `Non-payable items (${nonPayable.map((x) => x.description).join(', ')})`, amount: -nonPayableAmt, kind: 'less' });

    let roomExcess = 0;
    const rate = Number(billX.roomRentPerDay);
    if (rate > policy.roomRentCapPerDay) {
      const days = adm && dis ? Math.max(1, daysBetween(adm, dis)) : Number(billX.roomDays) || 1;
      roomExcess = (rate - policy.roomRentCapPerDay) * days;
      breakdown.push({ label: `Room rent above the ${inr(policy.roomRentCapPerDay)}/day limit (${days} days × ${inr(rate - policy.roomRentCapPerDay)})`, amount: -roomExcess, kind: 'less' });
      add('room_rent_exceeded', 'warn', `Room rent was ${inr(rate)}/day but the policy limit is ${inr(policy.roomRentCapPerDay)}/day. The extra ${inr(roomExcess)} isn't payable, and the insurer may also reduce some other charges proportionately.`, `कमरे का किराया ${inr(rate)}/दिन था, पॉलिसी की सीमा ${inr(policy.roomRentCapPerDay)}/दिन है। ${inr(roomExcess)} नहीं मिलेगा।`, 'claimAmount');
    }

    let admissible = Math.max(0, base - nonPayableAmt - roomExcess);
    if (policy.deductible > 0) {
      const d = Math.min(policy.deductible, admissible);
      breakdown.push({ label: 'Policy deductible', amount: -d, kind: 'less' });
      admissible -= d;
    }
    const dl = policy.diseaseLimits.find((x) => x.keywords.some((k) => diagnosis.includes(k)));
    if (dl && admissible > dl.limit) {
      breakdown.push({ label: `Limit for ${dl.name}`, amount: -(admissible - dl.limit), kind: 'less' });
      admissible = dl.limit;
    }
    const copayApplies = rel ? policy.copay.appliesTo.includes(rel) : false;
    const copay = copayApplies ? Math.round((admissible * policy.copay.percent) / 100) : 0;
    if (copay) breakdown.push({ label: `Co-pay ${policy.copay.percent}% (for ${rel === 'Father' ? 'father' : rel === 'Mother' ? 'mother' : rel})`, amount: -copay, kind: 'less' });
    let payout = admissible - copay;
    const remaining = policy.sumInsured - policy.sumInsuredUsed;
    let shortfall = 0;
    if (payout > remaining) {
      shortfall = payout - remaining;
      breakdown.push({ label: `Above your remaining cover of ${inr(remaining)}`, amount: -shortfall, kind: 'less' });
      add('sum_insured_short', 'warn', `Your remaining cover is ${inr(remaining)}, so about ${inr(shortfall)} of this claim can't be paid by this policy.`, `आपका बचा हुआ कवर ${inr(remaining)} है, इसलिए लगभग ${inr(shortfall)} इस पॉलिसी से नहीं मिलेगा।`, 'claimAmount');
      payout = remaining;
    }
    breakdown.push({ label: claimType === 'reimbursement' ? 'Estimated payout to you' : 'Estimated amount the insurer may cover', amount: payout, kind: 'total' });
    computed = { ...computed, amount: base, admissible, copay, copayApplies, payout, remaining, shortfall, youPay: base - payout };

    explain.en.push(`${claimType === 'reimbursement' ? 'Bill' : 'Estimate'}: ${inr(base)}`);
    explain.hi.push(`${claimType === 'reimbursement' ? 'बिल' : 'अनुमानित ख़र्च'}: ${inr(base)}`);
    if (copay) { explain.en.push(`${policy.copay.percent}% co-pay for parents: ${inr(copay)}`); explain.hi.push(`माता-पिता पर ${policy.copay.percent}% को-पे: ${inr(copay)}`); }
    explain.en.push(`Estimated ${claimType === 'reimbursement' ? 'payout' : 'insurer share'}: ${inr(payout)}`);
    explain.hi.push(`अनुमानित ${claimType === 'reimbursement' ? 'भुगतान' : 'बीमा हिस्सा'}: ${inr(payout)}`);
  }

  // --- what to ask next (depends on earlier answers)
  const blocking = issues.find((i) => i.severity === 'block');
  let next = null;
  const miss = (k) => missingFields.includes(k);
  const order = ['relationship', 'patientName', 'hospitalName'];
  for (const k of order) if (!next && miss(k)) next = { kind: 'field', key: k };
  if (!next && (miss('hospitalCity') || ['need_city', 'ambiguous'].includes(network?.status))) {
    next = { kind: 'field', key: 'hospitalCity', reason: network?.status };
  }
  if (!next && miss('admissionStatus')) next = { kind: 'field', key: 'admissionStatus' };
  if (!next && status === 'Discharged') {
    const seq = ['cashlessStatus', 'cashlessRejectionReason', 'doc:hospitalBill', 'doc:dischargeSummary', 'admissionDate', 'dischargeDate', 'diagnosis', 'claimAmount', 'upiId'];
    for (const s of seq) {
      if (s.startsWith('doc:')) { if (missingDocs.includes(s.slice(4))) { next = { kind: 'doc', key: s.slice(4) }; break; } }
      else if (miss(s)) { next = { kind: 'field', key: s }; break; }
    }
  }
  if (!next && status === 'Currently admitted') {
    for (const s of ['diagnosis', 'admissionDate', 'estimatedCost']) if (miss(s)) { next = { kind: 'field', key: s }; break; }
  }
  if (!next) { const k = missingFields[0]; if (k) next = { kind: 'field', key: k }; }
  if (blocking && blocking.field) next = { kind: 'fix', key: blocking.field, issue: blocking.id };

  return {
    applicable, required, requiredDocs, optionalDocs, missingFields, missingDocs, issues, breakdown, explain, computed, next, claimType, network,
    complete: missingFields.length === 0 && missingDocs.length === 0 && !blocking,
  };
}

// ================= PERSONAL LOAN =================
function evaluateLoan(fields, docs, ctx) {
  const cfg = ctx?.loanConfig || loanCfg;
  const today = todayIso(ctx);
  const issues = [];
  const add = (id, severity, en, hi, field) => issues.push({ id, severity, en, hi, field });
  const emp = val(fields, 'employmentType');

  const applicable = ['fullName', 'mobile', 'dob', 'pincode', 'city', 'pan', 'employmentType'];
  if (emp === 'Salaried') applicable.push('employerName');
  if (emp === 'Self-employed') applicable.push('businessName');
  applicable.push('workExperienceYears', 'monthlyIncome');
  if (emp !== 'Self-employed') applicable.push('salaryBank');
  applicable.push('existingEmi', 'creditCardDues', 'loanAmount', 'tenureMonths', 'purpose', 'disbursalUpi');
  const optional = ['city', 'salaryBank', 'creditCardDues', 'purpose'];
  const required = applicable.filter((k) => !optional.includes(k));
  const missingFields = required.filter((k) => !has(fields, k));

  // --- format checks (Indian formats)
  const pan = val(fields, 'pan');
  if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(pan).toUpperCase())) add('pan_invalid', 'block', 'That PAN doesn’t look right — it should be 10 characters like ABCDE1234F.', 'PAN सही नहीं लग रहा — ये ABCDE1234F जैसा 10 अक्षर का होता है।', 'pan');
  const mobile = val(fields, 'mobile');
  if (mobile && !/^[6-9]\d{9}$/.test(String(mobile).replace(/\D/g, '').slice(-10))) add('mobile_invalid', 'block', 'The mobile number should be a 10-digit Indian number starting with 6–9.', 'मोबाइल नंबर 6–9 से शुरू होने वाला 10 अंकों का होना चाहिए।', 'mobile');
  const pin = val(fields, 'pincode');
  if (pin && !/^[1-9]\d{5}$/.test(String(pin))) add('pincode_invalid', 'block', 'A PIN code has 6 digits and doesn’t start with 0.', 'PIN कोड 6 अंकों का होता है।', 'pincode');
  const dob = val(fields, 'dob');
  if (dob && dob > today) add('dob_future', 'block', 'The date of birth is in the future.', 'जन्मतिथि आगे की है।', 'dob');

  const amount = Number(val(fields, 'loanAmount'));
  const months = Number(val(fields, 'tenureMonths'));
  if (has(fields, 'tenureMonths') && (months < cfg.tenureMonths.min || months > cfg.tenureMonths.max)) {
    add('tenure_out_of_range', 'block', `Tenure must be between ${cfg.tenureMonths.min} and ${cfg.tenureMonths.max} months. How many months would you like?`, `अवधि ${cfg.tenureMonths.min} से ${cfg.tenureMonths.max} महीने के बीच होनी चाहिए। कितने महीने रखें?`, 'tenureMonths');
  }
  if (has(fields, 'loanAmount') && (amount < cfg.amount.min || amount > cfg.amount.max)) {
    add('amount_out_of_range', 'block', `Loan amount must be between ${inr(cfg.amount.min)} and ${inr(cfg.amount.max)}.`, `लोन की रकम ${inr(cfg.amount.min)} से ${inr(cfg.amount.max)} के बीच होनी चाहिए।`, 'loanAmount');
  }

  // --- eligibility (indicative)
  const income = Number(val(fields, 'monthlyIncome'));
  const existing = Number(val(fields, 'existingEmi') || 0);
  const cc = Number(val(fields, 'creditCardDues') || 0);
  const breakdown = [];
  const explain = { en: [], hi: [] };
  let computed = {};
  const tenureOk = months >= cfg.tenureMonths.min && months <= cfg.tenureMonths.max;
  if (income > 0 && amount > 0 && tenureOk && has(fields, 'existingEmi')) {
    const foirMax = cfg.foirMax[emp] ?? cfg.foirMax.Salaried;
    const ccObl = Math.round((cc * cfg.creditCardObligationPercent) / 100);
    const obligations = existing + ccObl;
    const newEmi = Math.round(emi(amount, months, cfg.interestRatePa));
    const maxTotalEmi = Math.round(income * foirMax);
    const available = maxTotalEmi - obligations;
    const foir = Math.round(((obligations + newEmi) / income) * 1000) / 10;
    const maxAmount = Math.max(0, Math.min(cfg.amount.max, Math.floor(principalForEmi(available, months, cfg.interestRatePa) / 1000) * 1000));
    let tenureNeeded = null;
    for (let t = months + 1; t <= cfg.tenureMonths.max; t += 1) if (emi(amount, t, cfg.interestRatePa) <= available) { tenureNeeded = t; break; }
    const fee = Math.round((amount * cfg.processingFeePercent) / 100);
    const gst = Math.round((fee * cfg.gstOnFeePercent) / 100);
    const totalRepayment = newEmi * months;
    const totalInterest = totalRepayment - amount;

    const age = dob ? ageOn(dob, today) : null;
    const exp = Number(val(fields, 'workExperienceYears'));
    const minInc = cfg.minMonthlyIncome[emp] ?? cfg.minMonthlyIncome.Salaried;
    const minExp = cfg.minExperienceYears[emp] ?? cfg.minExperienceYears.Salaried;
    const checks = [
      { id: 'age', label: `Age ${cfg.age.min}–${cfg.age.max}`, pass: age === null ? null : age >= cfg.age.min && age <= cfg.age.max, detail: age === null ? 'Date of birth needed' : `${age} years` },
      { id: 'income', label: `Income at least ${inr(minInc)}/month`, pass: income >= minInc, detail: inr(income) },
      { id: 'experience', label: `At least ${minExp} year${minExp > 1 ? 's' : ''} ${emp === 'Self-employed' ? 'in business' : 'of work experience'}`, pass: has(fields, 'workExperienceYears') ? exp >= minExp : null, detail: has(fields, 'workExperienceYears') ? `${exp} years` : 'Not given yet' },
      { id: 'amount', label: `Amount ${inr(cfg.amount.min)} – ${inr(cfg.amount.max)}`, pass: amount >= cfg.amount.min && amount <= cfg.amount.max, detail: inr(amount) },
      { id: 'foir', label: `All EMIs within ${Math.round(foirMax * 100)}% of income (FOIR)`, pass: foir <= foirMax * 100, detail: `${foir}%` },
    ];
    const failed = checks.filter((c) => c.pass === false);
    let outcome = 'indicatively_eligible';
    if (failed.length) outcome = failed.length === 1 && failed[0].id === 'foir' && maxAmount >= cfg.amount.min ? 'lower_amount' : 'not_eligible';
    if (checks.some((c) => c.pass === null) && outcome === 'indicatively_eligible') outcome = 'pending_details';

    computed = { newEmi, maxTotalEmi, obligations, ccObl, available, foir, foirMax, maxAmount, tenureNeeded, fee, gst, totalInterest, totalRepayment, netDisbursal: amount - fee - gst, rate: cfg.interestRatePa, checks, outcome, eligible: outcome === 'indicatively_eligible', label: cfg.label, configVersion: cfg.configVersion };

    breakdown.push({ label: 'Monthly income', amount: income, kind: 'base' });
    breakdown.push({ label: `Maximum for all EMIs (${Math.round(foirMax * 100)}% FOIR)`, amount: maxTotalEmi, kind: 'note' });
    if (existing) breakdown.push({ label: 'Existing EMIs', amount: -existing, kind: 'less' });
    if (ccObl) breakdown.push({ label: `Credit card dues (${cfg.creditCardObligationPercent}% of ${inr(cc)})`, amount: -ccObl, kind: 'less' });
    breakdown.push({ label: 'Room for a new EMI', amount: available, kind: 'total' });
    breakdown.push({ label: `EMI for ${inr(amount)}, ${months} months @ ${cfg.interestRatePa}%*`, amount: newEmi, kind: newEmi <= available ? 'ok' : 'over' });

    if (outcome === 'lower_amount') {
      add('foir_exceeded', 'warn', `An EMI of ${inr(newEmi)} would take your total EMIs to ${foir}% of income (limit ${Math.round(foirMax * 100)}%). Indicatively you could borrow about ${inr(maxAmount)} over ${months} months${tenureNeeded ? `, or ${inr(amount)} over ${tenureNeeded} months` : ''}. I haven't changed your request — tell me if you'd like to.`, `${inr(newEmi)} की EMI से कुल EMI आय का ${foir}% हो जाएगी (सीमा ${Math.round(foirMax * 100)}%)। ${months} महीने में लगभग ${inr(maxAmount)} तक मिल सकता है${tenureNeeded ? `, या ${tenureNeeded} महीने में ${inr(amount)}` : ''}। आपकी माँग मैंने नहीं बदली — बदलनी हो तो बताइए।`, 'loanAmount');
    }
    for (const c of failed.filter((c) => c.id !== 'foir' && c.id !== 'amount')) {
      add(`check_${c.id}`, 'warn', `${c.label}: not met (${c.detail}). Lenders usually decline applications that miss this.`, `${c.label}: पूरा नहीं होता (${c.detail})।`, c.id === 'income' ? 'monthlyIncome' : c.id === 'age' ? 'dob' : 'workExperienceYears');
    }
    explain.en.push(`EMI ${inr(newEmi)} for ${months} months at ${cfg.interestRatePa}% (illustrative)`);
    explain.hi.push(`${months} महीने, ${cfg.interestRatePa}% (उदाहरण दर) पर EMI ${inr(newEmi)}`);
    explain.en.push(`Total EMIs would be ${foir}% of income (limit ${Math.round(foirMax * 100)}%)`);
    explain.hi.push(`कुल EMI आय का ${foir}% होगी (सीमा ${Math.round(foirMax * 100)}%)`);
  }

  // --- what to ask next
  const blocking = issues.find((i) => i.severity === 'block');
  const order = ['loanAmount', 'employmentType', 'monthlyIncome', 'existingEmi', 'tenureMonths', 'employerName', 'businessName', 'workExperienceYears', 'pan', 'dob', 'pincode', 'fullName', 'mobile', 'disbursalUpi'];
  let next = null;
  for (const k of order) if (missingFields.includes(k)) { next = { kind: 'field', key: k }; break; }
  if (blocking && blocking.field) next = { kind: 'fix', key: blocking.field, issue: blocking.id };

  return {
    applicable, required, requiredDocs: [], optionalDocs: [], missingFields, missingDocs: [], issues, breakdown, explain, computed, next,
    complete: missingFields.length === 0 && !blocking,
  };
}

export function evaluate(journey, fields = {}, docs = {}, ctx = {}) {
  const r = journey === 'health_claim' ? evaluateClaim(fields, docs, ctx) : evaluateLoan(fields, docs, ctx);
  // kept for older UI code: warnings = everything the user should look at
  r.warnings = r.issues.filter((i) => i.severity !== 'info');
  return r;
}

export { prettyDate, allFields, SCHEMAS };
