// OFFLINE DEMO MODE ONLY — used when no AI key is configured (or the AI call fails).
// A rule-based extractor for Hindi/English/Hinglish chat. It never pretends to read a document:
// only the two bundled sample files are recognised, and the UI labels that clearly.
import network from '@/data/network-hospitals.json';

const DEV_DIGITS = '०१२३४५६७८९';
const normDigits = (s) => s.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));

const NUM_RE = /(\d[\d,]*(?:\.\d+)?)\s*(k\b|thousand|hazaar|hazar|hajar|हज़ार|हजार|lakh|lac|lakhs|लाख)?/gi;

const CATS = {
  health: {
    estimate: /(estimate|anumaan|anuman|kharcha hoga|kharch hoga|expected|lagega|lagenge|अनुमान)/gi,
    bill: /(\bbill\b|बिल|kharcha|खर्च|claim|क्लेम|rupaye|rupees|रुपये|\brs\.?|₹)/gi,
  },
  loan: {
    tenure: /(months?|mahine|mahina|महीने|महीना|saal|years?|साल)/gi,
    emi: /(\bemis?\b|ईएमआई|installment|kisht|किश्त)/gi,
    cc: /(credit card|क्रेडिट कार्ड)/gi,
    experience: /(experience|anubhav|अनुभव|saal se|years? at|years? in)/gi,
    income: /(salary|income|kamai|kamata|kamati|kamate|कमाई|कमाता|कमाती|सैलरी|तनख्वाह|earn|profit|munafa)/gi,
    loan: /(loan|लोन|udhar|उधार|borrow|\bneed\b|\bwant\b|chahiye|चाहिए)/gi,
  },
};

function numbersWithContext(text, cats) {
  const out = [];
  let m;
  NUM_RE.lastIndex = 0;
  while ((m = NUM_RE.exec(text))) {
    let n = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const mult = (m[2] || '').toLowerCase();
    if (/^(k|thousand|hazaar|hazar|hajar|हज़ार|हजार)$/.test(mult)) n *= 1000;
    if (/^(lakh|lac|lakhs|लाख)$/.test(mult)) n *= 100000;
    const start = m.index;
    const end = m.index + m[0].length;
    let best = null;
    for (const [cat, re] of Object.entries(cats)) {
      re.lastIndex = 0;
      let k;
      while ((k = re.exec(text))) {
        const ks = k.index;
        const ke = k.index + k[0].length;
        if (cat === 'tenure' && !(ks >= end && ks - end <= 3)) continue; // "24 mahine": unit right after
        if (cat === 'experience' && !(ks >= end && ks - end <= 12)) continue; // "5 saal ka experience"
        const dist = ks >= end ? ks - end : start - ke;
        if (dist < 0 || dist > 30) continue;
        if (!best || dist < best.dist) best = { cat, dist, unit: k[0].toLowerCase() };
      }
    }
    out.push({ n, raw: m[0], cat: best?.cat || null, unit: best?.unit, start });
  }
  return out;
}

const REL = [
  ['Father', /\b(papa|pitaji|pita ji|pita|father|dad|daddy|abbu)\b|पापा|पिताजी|पिता/i],
  ['Mother', /\b(maa|mummy|mother|mom|mataji|mata ji|ammi)\b|माँ|मां|मम्मी|माताजी|माता/i],
  ['Spouse', /\b(wife|patni|husband|pati|spouse)\b|पत्नी|पति/i],
  ['Son', /\b(beta|son)\b|बेटा|बेटे/i],
  ['Daughter', /\b(beti|daughter)\b|बेटी/i],
  ['Brother', /\b(bhai|bhaiya|brother)\b|भाई/i],
  ['Sister', /\b(behen|bahen|didi|sister)\b|बहन|दीदी/i],
  ['Self', /\b(myself|main khud|mujhe khud|self|i was admitted|i am admitted)\b|मैं ख़ुद|मैं खुद/i],
];

const DIAG = [
  ['Dengue', /dengue|डेंगू/i], ['Malaria', /malaria|मलेरिया/i], ['Typhoid', /typhoid|टाइफ़ाइड|टाइफाइड/i],
  ['Fracture', /fracture|haddi|हड्डी|फ्रैक्चर/i], ['Cataract', /cataract|motiyabind|मोतियाबिंद/i],
  ['Hernia', /hernia|हर्निया/i], ['Kidney stone', /kidney stone|pathri|पथरी/i], ['Appendicitis', /appendix|appendicitis/i],
  ['Pneumonia', /pneumonia|निमोनिया/i], ['Heart attack', /heart attack|dil ka daura|हार्ट अटैक/i],
  ['Dental treatment', /dental|daant|दाँत|root canal/i], ['Covid-19', /covid|corona/i], ['Viral fever', /bukhar|fever|बुखार/i],
];

const CITIES = ['Navi Mumbai', 'Mumbai', 'Thane', 'Pune', 'Delhi', 'New Delhi', 'Gurugram', 'Noida', 'Bengaluru', 'Bangalore', 'Chennai', 'Hyderabad', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow'];
const CITY_HI = { 'मुंबई': 'Mumbai', 'पुणे': 'Pune', 'दिल्ली': 'Delhi', 'चेन्नई': 'Chennai', 'हैदराबाद': 'Hyderabad', 'बेंगलुरु': 'Bengaluru', 'कोलकाता': 'Kolkata' };

const PURPOSE = [
  ['Wedding', /shaadi|shadi|wedding|शादी/i], ['Medical', /ilaaj|ilaj|medical|इलाज/i], ['Education', /padhai|education|fees|पढ़ाई|फ़ीस/i],
  ['Home renovation', /ghar|repair|renovation|घर/i], ['Business', /business ke liye|for (my )?business|dukaan ke liye/i], ['Travel', /travel|trip|yatra|यात्रा/i],
  ['Debt consolidation', /purana loan|consolidat|card bill chukane/i],
];
const BANKS = ['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak', 'Yes Bank', 'IDFC', 'Bank of Baroda', 'PNB', 'Canara', 'IndusInd', 'Paytm Payments Bank'];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseDates(text) {
  const year = new Date().getFullYear();
  const out = [];
  const pad = (x) => String(x).padStart(2, '0');
  let m;
  const re1 = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
  while ((m = re1.exec(text))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    out.push(`${y}-${pad(m[2])}-${pad(m[1])}`);
  }
  const re2 = /\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(\d{4})?/gi;
  while ((m = re2.exec(text))) out.push(`${m[3] || year}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`);
  return out;
}

function findHospital(text) {
  const t = text.toLowerCase();
  for (const h of network.hospitals) {
    for (const a of [h.name.toLowerCase(), ...h.aliases]) {
      if (new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) return h.name;
    }
  }
  const m = text.match(/((?:[\w.]+\s+){1,3})(hospitals?|clinic|nursing home|अस्पताल)/i);
  if (!m) return null;
  const stop = /^(ke|ki|ka|mein|me|in|at|the|to|se|a|an|my|hai|tha|admit|admitted|bharti|papa|maa|ko)$/i;
  const words = m[1].trim().split(/\s+/);
  const keep = [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const w = words[i];
    if (stop.test(w) || CITIES.some((c) => c.toLowerCase() === w.toLowerCase())) break;
    keep.unshift(w);
  }
  if (!keep.length) return null;
  const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${keep.map(title).join(' ')} ${/अस्पताल/.test(m[2]) ? 'Hospital' : title(m[2].toLowerCase())}`;
}

function findCity(text) {
  for (const [hi, en] of Object.entries(CITY_HI)) if (text.includes(hi)) return en;
  const t = text.toLowerCase();
  const hit = CITIES.find((c) => new RegExp(`\\b${c.toLowerCase()}\\b`).test(t));
  if (!hit) return null;
  return hit === 'Bangalore' ? 'Bengaluru' : hit === 'New Delhi' ? 'Delhi' : hit;
}

// pending = what Saral just asked for, so a short answer ("45 hazar", "Apollo") lands in the right field
const DATE_STRIP = /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{1,2}\s*(?:st|nd|rd|th)?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(?:\d{4})?/gi;

export function mockExtractText(journey, rawText, pending) {
  const text = normDigits(rawText || '');
  const noDates = text.replace(DATE_STRIP, ' ');
  const u = {};
  const pend = pending?.kind === 'field' || pending?.kind === 'fix' ? pending.key : null;
  const upi = text.match(/[\w.\-]{2,}@[a-z]{2,}/i);

  if (journey === 'health_claim') {
    for (const [rel, re] of REL) if (re.test(text)) { u.relationship = rel; break; }
    for (const [d, re] of DIAG) if (re.test(text)) { u.diagnosis = d; break; }
    const hosp = findHospital(text);
    if (hosp) u.hospitalName = hosp;
    const city = findCity(text);
    if (city) u.hospitalCity = city;

    if (/(abhi bhi|abhi|still|currently|is admitted|are admitted|admit (hai|hain|kiya hai|kiya gaya hai|ho gaye hain)|admitted hai|bharti hai|bharti hain|भर्ती है|भर्ती हैं)/i.test(text)) u.admissionStatus = 'Currently admitted';
    if (/(discharge|discharged|ghar aa gaye|ghar aa gayi|chhutti mil|डिस्चार्ज|छुट्टी)/i.test(text)) u.admissionStatus = 'Discharged';
    if (pend === 'admissionStatus' && !u.admissionStatus) {
      if (/(haan|yes|abhi|still|bharti|admit)/i.test(text)) u.admissionStatus = 'Currently admitted';
      else if (/(nahi|no|ghar)/i.test(text)) u.admissionStatus = 'Discharged';
    }
    if (/cashless.*(reject|nahi mila|deny|denied|mana)|(reject|denied).*cashless/i.test(text)) u.cashlessStatus = 'Rejected';
    else if (/(cashless (nahi|not) (use|liya|kiya|lia)|no cashless|didn'?t use cashless|khud (pay|bhara|diya)|paid (it )?myself)/i.test(text)) u.cashlessStatus = 'Not used';
    else if (pend === 'cashlessStatus') {
      if (/reject/i.test(text)) u.cashlessStatus = 'Rejected';
      else if (/(nahi|no|not|khud)/i.test(text)) u.cashlessStatus = 'Not used';
    }

    const nums = numbersWithContext(noDates, CATS.health).filter((x) => x.n >= 100);
    const est = nums.find((x) => x.cat === 'estimate');
    const bill = nums.find((x) => x.cat === 'bill');
    if (est) u.estimatedCost = est.n;
    if (bill) u.claimAmount = bill.n;
    if (!est && !bill && nums.length === 1) {
      if (pend === 'estimatedCost') u.estimatedCost = nums[0].n;
      else u.claimAmount = nums[0].n;
    }
    if (upi) u.upiId = upi[0];
    const dates = parseDates(text);
    if (dates.length >= 2) { u.admissionDate = dates[0]; u.dischargeDate = dates[1]; }
    else if (dates.length === 1) u[pend === 'dischargeDate' ? 'dischargeDate' : 'admissionDate'] = dates[0];
  }

  if (journey === 'loan_precheck') {
    const expM = noDates.match(/(\d+(?:\.\d+)?)\s*(?:saal|years?|yrs?|साल)\s*(?:ka|ki|of|से)?\s*(?:experience|exp|anubhav|अनुभव|kaam|job)/i);
    if (expM) u.workExperienceYears = Number(expM[1]);
    const pan = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/i) || (pend === 'pan' ? text.match(/\b[A-Z0-9]{8,12}\b/i) : null);
    if (pan) u.pan = pan[0].toUpperCase();
    if (upi) u.disbursalUpi = upi[0];
    const mobile = text.match(/\b[6-9]\d{9}\b/);
    if (mobile) u.mobile = mobile[0];
    const pin = text.match(/\b[1-9]\d{5}\b/);
    if (pin && (pend === 'pincode' || /pin|पिन/i.test(text))) u.pincode = pin[0];

    if (/\b(salaried|naukri|job|company|private|sarkari|employee|work (at|for)|kaam karta|kaam karti)\b|नौकरी|कंपनी|सरकारी/i.test(text)) u.employmentType = 'Salaried';
    else if (/\b(business|dukaan|dukan|shop|self.?employed|apna kaam|khud ka kaam|freelance)\b|दुकान|बिज़नेस|अपना काम/i.test(text)) u.employmentType = 'Self-employed';
    const emp = text.match(/(?:work (?:at|for)|working (?:at|in|with)|job at|employed at)\s+([A-Z][\w&.]*(?:\s+[A-Z][\w&.]*){0,3})/) || text.match(/\b([A-Z][\w&.]*(?:\s+[A-Z][\w&.]*){0,2})\s+(?:mein|me|में)\b/);
    if (emp) u.employerName = emp[1].trim();
    for (const b of BANKS) if (new RegExp(`\\b${b}\\b`, 'i').test(text) && /(salary|सैलरी|account|khata)/i.test(text)) { u.salaryBank = b; break; }

    if (/(no emi|koi emi nahi|emi nahi|koi emi nahin|ईएमआई नहीं|कोई emi नहीं|कोई ईएमआई नहीं|no loans?)/i.test(text)) u.existingEmi = 0;
    else if (pend === 'existingEmi' && /^\s*(nahi|nahin|no|none|नहीं|कोई नहीं)\b/i.test(text)) u.existingEmi = 0;
    if (/(no credit card|credit card nahi|card ka koi baki nahi)/i.test(text)) u.creditCardDues = 0;
    for (const [p, re] of PURPOSE) if (re.test(text)) { u.purpose = p; break; }

    const loanText = expM ? noDates.replace(expM[0], ' ') : noDates;
    for (const x of numbersWithContext(loanText, CATS.loan)) {
      if (x.cat === 'tenure' && pend === 'workExperienceYears' && /saal|year|साल/.test(x.unit || '')) u.workExperienceYears = x.n;
      else if (x.cat === 'tenure') u.tenureMonths = /saal|year|साल/.test(x.unit || '') ? x.n * 12 : x.n;
      else if (x.cat === 'experience') u.workExperienceYears = x.n;
      else if (x.cat === 'emi') u.existingEmi = x.n;
      else if (x.cat === 'cc') u.creditCardDues = x.n;
      else if (x.cat === 'income') u.monthlyIncome = x.n;
      else if (x.cat === 'loan') u.loanAmount = x.n;
      else if (pend && ['loanAmount', 'monthlyIncome', 'existingEmi', 'tenureMonths', 'workExperienceYears', 'creditCardDues'].includes(pend) && u[pend] === undefined && String(x.n) !== u.pincode) u[pend] = x.n;
    }
    const dates = parseDates(text);
    if (dates.length && (pend === 'dob' || /(born|janm|जन्म|dob|birth)/i.test(text))) u.dob = dates[0];
  }

  // A short free-text answer to a text question fills that field
  const textPend = ['patientName', 'hospitalName', 'hospitalCity', 'diagnosis', 'cashlessRejectionReason', 'fullName', 'purpose', 'policyHolder', 'policyNumber', 'employerName', 'businessName', 'salaryBank'];
  if (pend && textPend.includes(pend) && u[pend] === undefined && !Object.keys(u).length && rawText.trim().length <= 80 && !/\d/.test(rawText) && !/\?/.test(rawText)) {
    let v = rawText.trim().replace(/[.।!?]+$/, '');
    if (pend === 'hospitalName' && !/hospital|clinic|home|अस्पताल/i.test(v)) v = `${v} Hospital`;
    u[pend] = v;
  }

  return Object.entries(u).map(([field, value]) => ({ field, value, confidence: 0.8 }));
}

// "Use the bill amount" / "jo maine bataya" → which option the user picked in a conflict
export function detectChoice(text) {
  const t = (text || '').toLowerCase();
  if (/(bill|document|doc|summary|receipt|report|wala sahi|haan|yes|ha\b|ok|theek)/i.test(t)) return 'document';
  if (/(maine|mera|mine|what i said|jo bola|jo bataya|nahi|no\b)/i.test(t)) return 'user';
  return null;
}

// Canned answers to common questions (offline mode — the AI answers these when a key is set)
const FAQ = {
  health_claim: [
    [/co.?pay|को.?पे/i, 'को-पे का मतलब है बिल का एक हिस्सा आप ख़ुद देते हैं। इस पॉलिसी में माता-पिता के क्लेम पर 10% को-पे है।', 'Co-pay means you pay a share of the bill yourself. This policy has a 10% co-pay on claims for parents.'],
    [/cashless/i, 'कैशलेस में अस्पताल सीधे बीमा कंपनी से पैसे लेता है — पर सिर्फ़ नेटवर्क अस्पताल में, और प्री-ऑथराइज़ेशन मंज़ूर होने के बाद।', 'With cashless, the hospital is paid directly by the insurer — only at network hospitals, and only after pre-authorisation is approved.'],
    [/reimburse/i, 'रिइम्बर्समेंट में आप पहले बिल भरते हैं, फिर डॉक्यूमेंट भेजकर पैसे वापस लेते हैं।', 'With reimbursement you pay the hospital first, then claim the money back with your documents.'],
    [/room rent|कमरे/i, 'इस पॉलिसी में कमरे का किराया ₹5,000 प्रति दिन तक कवर है।', 'This policy covers room rent up to ₹5,000 a day.'],
    [/waiting|इंतज़ार/i, 'नई पॉलिसी में पहले 30 दिन बीमारी कवर नहीं होती (एक्सीडेंट छोड़कर), और कुछ बीमारियों पर 2 साल का वेटिंग पीरियड है।', 'New cover has a 30-day initial waiting period for illness (not accidents), and some illnesses have a 2-year waiting period.'],
    [/cover|kya kya|exclu|कवर|नहीं मिलेगा/i, 'कॉस्मेटिक सर्जरी, दाँत का इलाज (एक्सीडेंट छोड़कर) और खाने-पीने जैसे नॉन-मेडिकल ख़र्च कवर नहीं हैं।', 'Cosmetic surgery, dental treatment (unless from an accident) and non-medical items are not covered.'],
  ],
  loan_precheck: [
    [/foir/i, 'FOIR यानी आपकी कमाई का कितना हिस्सा EMI में जाता है। ज़्यादातर बैंक 50% तक रखते हैं।', 'FOIR is the share of your income that goes to EMIs. Most lenders keep it under about 50%.'],
    [/interest|byaj|ब्याज|rate/i, 'यहाँ 16% सालाना सिर्फ़ उदाहरण दर है — असली दर बैंक आपकी प्रोफ़ाइल देखकर तय करेगा।', '16% a year here is only an illustrative rate — a real lender sets the rate based on your profile.'],
    [/credit score|cibil|सिबिल|स्कोर/i, 'ये सिर्फ़ अनुमान है — इससे आपके क्रेडिट स्कोर पर कोई असर नहीं पड़ता।', 'This is only an estimate — it does not affect your credit score.'],
    [/processing|fee|फ़ीस/i, 'प्रोसेसिंग फ़ीस यहाँ 2% + GST मानी गई है, जो लोन की रकम से कटती है।', 'Processing fee is assumed at 2% + GST here, deducted from the loan amount.'],
    [/emi kya|what is emi|ईएमआई क्या/i, 'EMI वो रकम है जो आप हर महीने लोन चुकाने के लिए देते हैं।', 'An EMI is the fixed amount you pay every month to repay the loan.'],
  ],
};

export function mockAnswer(journey, text, lang) {
  if (!/\?|kya|kaise|kab|kitne|what|how|when|क्या|कैसे|कब|कितने|explain|matlab/i.test(text)) return null;
  for (const [re, hi, en] of FAQ[journey] || []) if (re.test(text)) return lang === 'hi' ? hi : en;
  return null;
}

// Only the two bundled sample documents are recognised offline. Anything else returns null,
// and Saral says it can't read the file without an AI key — it never invents values.
const SAMPLES = {
  'hospital-bill.jpg': {
    docType: 'hospitalBill',
    fields: { hospitalName: 'Shanti Care Multispeciality Hospital', hospitalCity: 'Mumbai', patientName: 'Suresh Sharma', admissionDate: '2026-10-20', dischargeDate: '2026-10-24', diagnosis: 'Dengue fever with low platelet count', claimAmount: 42000 },
    extra: {
      roomRentPerDay: 4500, roomDays: 4,
      lineItems: [
        { description: 'Room rent - semi-private (4 days)', amount: 18000 },
        { description: 'Consultant visits & doctor fees', amount: 6500 },
        { description: 'Pharmacy & IV fluids', amount: 9800 },
        { description: 'Laboratory (CBC, platelet, NS1)', amount: 5200 },
        { description: 'Medical consumables', amount: 2500 },
      ],
    },
  },
  'discharge-summary.jpg': {
    docType: 'dischargeSummary',
    fields: { patientName: 'Suresh Sharma', hospitalName: 'Shanti Care Multispeciality Hospital', admissionDate: '2026-10-20', dischargeDate: '2026-10-24', diagnosis: 'Dengue fever with low platelet count' },
    extra: {},
  },
};

export function mockExtractDoc(fileName = '') {
  const s = SAMPLES[String(fileName).toLowerCase().split(/[\\/]/).pop()];
  if (!s) return null;
  return { docType: s.docType, fields: { ...s.fields }, extra: { ...s.extra }, confidence: 0.9, readBy: 'sample' };
}
