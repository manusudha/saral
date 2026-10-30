// Offline extractor used when no AI key is set (or the AI call fails).
// Good enough to rehearse the full demo; the real AI handles free-form speech much better.

const DEV_DIGITS = '०१२३४५६७८९';
const normDigits = (s) => s.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));

const NUM_RE = /(\d[\d,]*(?:\.\d+)?)\s*(k\b|thousand|hazaar|hazar|हज़ार|हजार|lakh|lac|लाख)?/gi;

const CATS = {
  tenure: /(months?|mahine|mahina|महीने|महीना|saal|years?|साल)/gi,
  emi: /(\bemis?\b|ईएमआई|installment|kisht|किश्त)/gi,
  income: /(salary|income|kamai|kamata|kamati|kamate|कमाई|कमाता|कमाती|सैलरी|तनख्वाह|earn)/gi,
  loan: /(loan|लोन|udhar|उधार|borrow|\bneed\b|chahiye|चाहिए)/gi,
  bill: /(\bbill\b|बिल|kharcha|खर्च|claim|क्लेम|rupaye|rupees|रुपये|\brs\.?|₹)/gi,
};

function numbersWithContext(text) {
  const out = [];
  let m;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(text))) {
    let n = Number(m[1].replace(/,/g, ''));
    const mult = (m[2] || '').toLowerCase();
    if (/^(k|thousand|hazaar|hazar|हज़ार|हजार)$/.test(mult)) n *= 1000;
    if (/^(lakh|lac|लाख)$/.test(mult)) n *= 100000;
    const start = m.index;
    const end = m.index + m[0].length;
    // nearest keyword category
    let best = null;
    for (const [cat, re] of Object.entries(CATS)) {
      re.lastIndex = 0;
      let k;
      while ((k = re.exec(text))) {
        const ks = k.index;
        const ke = k.index + k[0].length;
        if (cat === 'tenure' && !(ks >= end && ks - end <= 3)) continue; // "12 mahine": keyword right after
        const dist = ks >= end ? ks - end : start - ke;
        if (dist < 0 || dist > 30) continue;
        if (!best || dist < best.dist) best = { cat, dist, unit: k[0].toLowerCase() };
      }
    }
    out.push({ n, raw: m[0], cat: best?.cat || null, unit: best?.unit });
  }
  return out;
}

const REL = [
  ['Father', /\b(papa|pitaji|pita ji|pita|father|dad|daddy)\b|पापा|पिताजी|पिता/i],
  ['Mother', /\b(maa|mummy|mother|mom|mataji|mata ji)\b|माँ|मां|मम्मी|माताजी|माता/i],
  ['Spouse', /\b(wife|patni|husband|pati|spouse)\b|पत्नी|पति/i],
  ['Son', /\b(beta|son)\b|बेटा|बेटे/i],
  ['Daughter', /\b(beti|daughter)\b|बेटी/i],
  ['Self', /\b(myself|main khud|mera khud|self)\b|मैं ख़ुद|मैं खुद/i],
];

const DIAG = [
  ['Dengue fever', /dengue|डेंगू/i],
  ['Malaria', /malaria|मलेरिया/i],
  ['Typhoid', /typhoid|टाइफ़ाइड|टाइफाइड/i],
  ['Fracture', /fracture|haddi|हड्डी|फ्रैक्चर/i],
  ['Viral fever', /bukhar|fever|बुखार/i],
];

const PURPOSE = [
  ['Wedding', /shaadi|shadi|wedding|शादी/i],
  ['Medical', /ilaaj|ilaj|medical|hospital|इलाज/i],
  ['Education', /padhai|education|fees|पढ़ाई|फ़ीस/i],
  ['Home repair', /ghar|repair|renovation|घर/i],
  ['Business', /business|dukaan|dukan|बिज़नेस|दुकान/i],
  ['Travel', /travel|trip|yatra|यात्रा/i],
];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function parseDates(text) {
  const year = new Date().getFullYear();
  const out = [];
  const pad = (x) => String(x).padStart(2, '0');
  let m;
  const re1 = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;
  while ((m = re1.exec(text))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    out.push(`${y}-${pad(m[2])}-${pad(m[1])}`);
  }
  const re2 = /(\d{1,2})\s*(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/gi;
  while ((m = re2.exec(text))) out.push(`${year}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`);
  return out;
}

// pending = the field Saral just asked for, so a bare answer ("45 hazar") lands in the right place
export function mockExtractText(journey, rawText, pending) {
  const text = normDigits(rawText || '');
  const u = {};
  const pend = pending?.kind === 'field' ? pending.key : null;

  const pan = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/i);
  const upi = text.match(/[\w.\-]{2,}@[a-z]{2,}/i);
  const mobile = text.match(/\b[6-9]\d{9}\b/);

  if (journey === 'health_claim') {
    for (const [rel, re] of REL) if (re.test(text)) { u.relationship = rel; break; }
    for (const [d, re] of DIAG) if (re.test(text)) { u.diagnosis = d; break; }
    const hosp = text.match(/((?:[A-Z][\w.]*\s+){1,4})(Hospital|Clinic|Nursing Home)/);
    if (hosp) u.hospitalName = (hosp[1] + hosp[2]).trim();
    const nums = numbersWithContext(text).filter((x) => x.n >= 100);
    const bill = nums.find((x) => x.cat === 'bill') || (nums.length === 1 ? nums[0] : null);
    if (bill) u.claimAmount = bill.n;
    if (upi) u.upiId = upi[0];
    const dates = parseDates(text);
    if (dates.length >= 2) { u.admissionDate = dates[0]; u.dischargeDate = dates[1]; }
    else if (dates.length === 1 && (pend === 'admissionDate' || pend === 'dischargeDate')) u[pend] = dates[0];
  }

  if (journey === 'loan_precheck') {
    if (pan) u.pan = pan[0].toUpperCase();
    if (upi) u.disbursalUpi = upi[0];
    if (mobile) u.mobile = mobile[0];
    if (/\b(salaried|naukri|job|company|private|sarkari)\b|नौकरी|कंपनी|सरकारी/i.test(text)) u.employmentType = 'Salaried';
    else if (/\b(business|dukaan|dukan|shop|self.?employed|apna kaam)\b|दुकान|बिज़नेस|अपना काम/i.test(text)) u.employmentType = 'Self-employed';
    if (/(no emi|koi emi nahi|emi nahi|koi emi nahin|ईएमआई नहीं|कोई emi नहीं|कोई ईएमआई नहीं)/i.test(text)) u.existingEmi = 0;
    else if (pend === 'existingEmi' && /^\s*(nahi|nahin|no|none|नहीं|कोई नहीं)\b/i.test(text)) u.existingEmi = 0;
    for (const [p, re] of PURPOSE) if (re.test(text)) { u.purpose = p; break; }
    for (const x of numbersWithContext(text)) {
      if (x.cat === 'tenure') u.tenureMonths = /saal|year|साल/.test(x.unit || '') ? x.n * 12 : x.n;
      else if (x.cat === 'emi') u.existingEmi = x.n;
      else if (x.cat === 'income') u.monthlyIncome = x.n;
      else if (x.cat === 'loan') u.loanAmount = x.n;
      else if (pend && ['loanAmount', 'monthlyIncome', 'existingEmi', 'tenureMonths'].includes(pend) && u[pend] === undefined) u[pend] = x.n;
    }
  }

  // A short free-text answer to a text question ("Suresh Sharma") fills that field
  const textPend = ['patientName', 'hospitalName', 'diagnosis', 'fullName', 'purpose', 'policyHolder', 'policyNumber'];
  if (pend && textPend.includes(pend) && u[pend] === undefined && rawText.trim().length <= 40 && !/\d{3,}/.test(rawText)) {
    u[pend] = rawText.trim().replace(/[.।!?]+$/, '');
  }

  return Object.entries(u).map(([field, value]) => ({ field, value, confidence: 0.8 }));
}

// Fixed results for the bundled sample documents (public/samples)
const DOC_FIXTURES = {
  hospitalBill: {
    docType: 'hospitalBill',
    fields: {
      hospitalName: 'Shanti Care Multispeciality Hospital, Andheri (E), Mumbai',
      patientName: 'Suresh Sharma',
      admissionDate: '2026-10-20',
      dischargeDate: '2026-10-24',
      diagnosis: 'Dengue fever with low platelet count',
      claimAmount: 42000,
    },
  },
  dischargeSummary: {
    docType: 'dischargeSummary',
    fields: {
      patientName: 'Suresh Sharma',
      hospitalName: 'Shanti Care Multispeciality Hospital, Andheri (E), Mumbai',
      admissionDate: '2026-10-20',
      dischargeDate: '2026-10-24',
      diagnosis: 'Dengue fever with low platelet count',
    },
  },
};

export function mockExtractDoc(fileName = '', expected) {
  const name = fileName.toLowerCase();
  let key = expected === 'dischargeSummary' ? 'dischargeSummary' : 'hospitalBill';
  if (name.includes('discharge') || name.includes('summary')) key = 'dischargeSummary';
  else if (name.includes('bill') || name.includes('invoice')) key = 'hospitalBill';
  return DOC_FIXTURES[key];
}

// Canned answers to common questions (offline mode only — the AI answers these when a key is set)
const FAQ = {
  health_claim: [
    [/co.?pay|को.?पे/i, 'को-पे का मतलब है बिल का एक हिस्सा आप ख़ुद देते हैं। इस पॉलिसी में माता-पिता के क्लेम पर 10% को-पे है।', 'Co-pay means you pay a share of the bill yourself. This policy has a 10% co-pay on claims for parents.'],
    [/cover|kya kya|exclu|कवर|नहीं मिलेगा/i, 'कॉस्मेटिक सर्जरी, दाँत का इलाज (एक्सीडेंट छोड़कर) और खाने-पीने जैसे नॉन-मेडिकल ख़र्च कवर नहीं हैं।', 'Cosmetic surgery, dental treatment (unless from an accident) and non-medical items like food and toiletries are not covered.'],
    [/kitne din|deadline|kab tak|कितने दिन|कब तक/i, 'क्लेम डिस्चार्ज के 60 दिन के अंदर करना होता है।', 'Claims must be filed within 60 days of discharge.'],
    [/kab milega|kitne din mein paisa|when.*(money|paid)|पैसा कब/i, 'अप्रूवल के बाद 7 दिन के अंदर पैसा आपके UPI पर आ जाता है।', 'Once approved, the money reaches your UPI within 7 days.'],
  ],
  loan_precheck: [
    [/interest|byaj|ब्याज|rate/i, 'इस ऑफ़र पर ब्याज 16% सालाना है।', 'The interest rate on this offer is 16% a year.'],
    [/credit score|cibil|सिबिल|स्कोर/i, 'ये प्री-चेक है — इससे आपके क्रेडिट स्कोर पर कोई असर नहीं पड़ता।', 'This is a pre-check — it does not affect your credit score.'],
    [/emi kya|what is emi|ईएमआई क्या/i, 'EMI वो रकम है जो आप हर महीने लोन चुकाने के लिए देते हैं।', 'An EMI is the fixed amount you pay every month to repay the loan.'],
  ],
};

export function mockAnswer(journey, text, lang) {
  if (!/\?|kya|kaise|kab|kitne|what|how|when|क्या|कैसे|कब|कितने/i.test(text)) return null;
  for (const [re, hi, en] of FAQ[journey] || []) if (re.test(text)) return lang === 'hi' ? hi : en;
  return null;
}
