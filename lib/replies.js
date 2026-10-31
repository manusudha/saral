// What Saral says. Templates (not the AI) write questions and money lines,
// so replies are fast, consistent and never invent numbers.
import { inr, prettyDate } from './format';
import { SCHEMAS, fieldDef } from './schemas';
import profile from '@/data/profile.json';

const firstName = profile.fullName.split(' ')[0];
const firstNameHi = profile.firstNameHi || firstName;

export const HI_LABEL = {
  policyNumber: 'पॉलिसी नंबर', policyHolder: 'पॉलिसी होल्डर', patientName: 'मरीज़ का नाम', relationship: 'रिश्ता',
  hospitalName: 'अस्पताल', hospitalCity: 'शहर', admissionStatus: 'मरीज़ की स्थिति', cashlessStatus: 'कैशलेस', cashlessRejectionReason: 'रिजेक्शन की वजह',
  admissionDate: 'भर्ती की तारीख़', dischargeDate: 'डिस्चार्ज की तारीख़', diagnosis: 'बीमारी', estimatedCost: 'अनुमानित ख़र्च',
  claimAmount: 'बिल की रकम', upiId: 'UPI ID', fullName: 'नाम', mobile: 'मोबाइल', pan: 'PAN', dob: 'जन्मतिथि', pincode: 'PIN कोड', city: 'शहर',
  employmentType: 'काम', employerName: 'कंपनी', businessName: 'बिज़नेस', workExperienceYears: 'अनुभव', monthlyIncome: 'मासिक आय', salaryBank: 'सैलरी बैंक',
  existingEmi: 'मौजूदा EMI', creditCardDues: 'क्रेडिट कार्ड बकाया', loanAmount: 'लोन की रकम', tenureMonths: 'अवधि', purpose: 'मकसद', disbursalUpi: 'UPI ID',
};
const EN_LABEL = {
  relationship: 'relationship', patientName: 'patient name', hospitalName: 'hospital', hospitalCity: 'city', admissionStatus: 'patient status',
  admissionDate: 'admission date', dischargeDate: 'discharge date', diagnosis: 'diagnosis', estimatedCost: 'estimated cost', claimAmount: 'bill amount',
  upiId: 'UPI ID', cashlessStatus: 'cashless status', cashlessRejectionReason: 'rejection reason', monthlyIncome: 'income', existingEmi: 'existing EMI',
  loanAmount: 'loan amount', tenureMonths: 'tenure', employmentType: 'employment', employerName: 'employer', businessName: 'business',
  workExperienceYears: 'experience', pan: 'PAN', dob: 'date of birth', pincode: 'PIN code', creditCardDues: 'credit card dues', purpose: 'purpose',
  fullName: 'name', mobile: 'mobile', disbursalUpi: 'UPI ID', city: 'city', salaryBank: 'salary bank',
};

const ASK = {
  hi: {
    relationship: 'मरीज़ आपके क्या लगते हैं — पिताजी, माताजी, पत्नी या आप ख़ुद?',
    patientName: 'मरीज़ का पूरा नाम बताइए।',
    hospitalName: 'किस अस्पताल में भर्ती हैं या थे?',
    hospitalCity: 'अस्पताल किस शहर में है?',
    admissionStatus: 'क्या वो अभी भी अस्पताल में भर्ती हैं, या डिस्चार्ज हो चुके हैं?',
    cashlessStatus: 'ये नेटवर्क अस्पताल है — क्या आपने कैशलेस की कोशिश की थी, और वो रिजेक्ट हुआ? या कैशलेस इस्तेमाल नहीं किया?',
    cashlessRejectionReason: 'कैशलेस रिजेक्ट होने की क्या वजह बताई गई थी?',
    admissionDate: 'भर्ती किस तारीख़ को हुए थे?',
    dischargeDate: 'डिस्चार्ज किस तारीख़ को हुआ?',
    diagnosis: 'डॉक्टर ने क्या बीमारी बताई है?',
    estimatedCost: 'अस्पताल ने इलाज का कुल अनुमानित ख़र्च कितना बताया है?',
    claimAmount: 'फ़ाइनल बिल कितने का था?',
    upiId: 'पैसे किस UPI ID पर भेजूँ?',
    'doc:hospitalBill': 'अब अस्पताल के फ़ाइनल बिल की फ़ोटो या PDF भेजिए — तारीख़ें, बीमारी और रकम मैं उसी से पढ़ लूँगा।',
    'doc:dischargeSummary': 'अब डिस्चार्ज समरी भेजिए — मैं इसे बिल से मिलाकर देखूँगा।',
    loanAmount: 'कितने का लोन चाहिए?',
    employmentType: 'आप नौकरी करते हैं या अपना काम/बिज़नेस है?',
    employerName: 'किस कंपनी में काम करते हैं?',
    businessName: 'आपके बिज़नेस का नाम क्या है?',
    workExperienceYears: 'कुल कितने साल का अनुभव है?',
    monthlyIncome: 'हर महीने कितनी कमाई होती है?',
    existingEmi: 'अभी कोई EMI चल रही है? हो तो हर महीने कितनी?',
    tenureMonths: 'कितने महीनों में चुकाना चाहेंगे — 12, 24 या 36?',
    pan: 'अपना PAN नंबर बताइए।',
    dob: 'आपकी जन्मतिथि क्या है?',
    pincode: 'घर का PIN कोड बताइए।',
    fullName: 'आपका पूरा नाम?',
    mobile: 'आपका मोबाइल नंबर?',
    disbursalUpi: 'लोन किस UPI ID पर चाहिए?',
  },
  en: {
    relationship: 'Who is the patient — your father, mother, spouse, or yourself?',
    patientName: "What is the patient's full name?",
    hospitalName: 'Which hospital is (or was) the patient admitted to?',
    hospitalCity: 'Which city is the hospital in?',
    admissionStatus: 'Is the patient still admitted, or already discharged?',
    cashlessStatus: 'This is a network hospital — did you try cashless and get rejected, or not use cashless at all?',
    cashlessRejectionReason: 'What reason was given for rejecting cashless?',
    admissionDate: 'On what date was the patient admitted?',
    dischargeDate: 'On what date was the patient discharged?',
    diagnosis: 'What did the doctor diagnose?',
    estimatedCost: 'What total treatment cost has the hospital estimated?',
    claimAmount: 'What was the final bill amount?',
    upiId: 'Which UPI ID should the money go to?',
    'doc:hospitalBill': "Please send the final hospital bill (photo or PDF) — I'll read the dates, diagnosis and amount from it.",
    'doc:dischargeSummary': "Now please send the discharge summary — I'll check it against the bill.",
    loanAmount: 'How much would you like to borrow?',
    employmentType: 'Are you salaried or self-employed?',
    employerName: 'Which company do you work for?',
    businessName: "What's the name of your business?",
    workExperienceYears: 'How many years of work experience do you have in total?',
    monthlyIncome: 'What is your monthly income?',
    existingEmi: 'Do you have any EMIs running? If yes, how much a month?',
    tenureMonths: 'Over how many months would you like to repay — 12, 24 or 36?',
    pan: 'What is your PAN?',
    dob: 'What is your date of birth?',
    pincode: "What's your residential PIN code?",
    fullName: 'What is your full name?',
    mobile: 'What is your mobile number?',
    disbursalUpi: 'Which UPI ID should the loan go to?',
  },
};

const DOC_NAME = {
  en: { hospitalBill: 'hospital bill', dischargeSummary: 'discharge summary', preAuthForm: 'pre-authorisation form', rejectionLetter: 'rejection letter', paymentReceipt: 'payment receipt', pharmacyBill: 'pharmacy bill', diagnosticReport: 'diagnostic report', prescription: 'prescription', other: 'document' },
  hi: { hospitalBill: 'बिल', dischargeSummary: 'डिस्चार्ज समरी', preAuthForm: 'प्री-ऑथ फ़ॉर्म', rejectionLetter: 'रिजेक्शन लेटर', paymentReceipt: 'रसीद', pharmacyBill: 'दवा का बिल', diagnosticReport: 'रिपोर्ट', prescription: 'पर्चा', other: 'डॉक्यूमेंट' },
};

export function greeting(journey, lang, memorySources = []) {
  if (journey === 'health_claim') {
    return lang === 'hi'
      ? `नमस्ते ${firstNameHi} जी! मैं सरल हूँ। आपकी पॉलिसी मैंने पहले से भर दी है। बताइए, किसका इलाज हो रहा है या हुआ, और किस अस्पताल में? बोलकर या लिखकर बताइए।`
      : `Hi ${firstName}! I'm Saral. I've already loaded your policy. Tell me who's being treated (or was), and at which hospital — speak or type.`;
  }
  const remembered = memorySources.length ? (lang === 'hi' ? ' कुछ जानकारी पिछली बार से याद है, वो भी भर दी है।' : ' I also remembered a few details from last time.') : '';
  return lang === 'hi'
    ? `नमस्ते ${firstNameHi} जी! आपका नाम, मोबाइल, जन्मतिथि और PIN मैंने आपके अकाउंट से भर दिए हैं।${remembered} बताइए, कितने का लोन चाहिए और आपकी कमाई कितनी है?`
    : `Hi ${firstName}! I've filled your name, mobile, date of birth and PIN from your account.${remembered} How much would you like to borrow, and what do you earn?`;
}

function fmtField(journey, key, v, lang) {
  const def = fieldDef(SCHEMAS[journey], key);
  if (key === 'tenureMonths') return lang === 'hi' ? `${v} महीने` : `${v} months`;
  if (key === 'workExperienceYears') return lang === 'hi' ? `${v} साल` : `${v} years`;
  if (def?.type === 'number') return inr(v);
  if (def?.type === 'date') return prettyDate(v);
  return v;
}

function ack(lang, updates, prevFields, journey) {
  if (!updates.length) return '';
  const corrected = updates.filter((u) => {
    const p = prevFields?.[u.field];
    return p && p.value !== undefined && p.value !== '' && p.value !== u.value && ['voice', 'chat', 'user', 'account', 'memory'].includes(p.source);
  });
  if (corrected.length) {
    const c = corrected[0];
    const fmt = (v) => fmtField(journey, c.field, v, lang);
    return lang === 'hi'
      ? `ठीक है — ${HI_LABEL[c.field] || c.field} ${fmt(prevFields[c.field].value)} से बदलकर ${fmt(c.value)} कर दिया, और हिसाब दोबारा लगाया।`
      : `Updated your ${EN_LABEL[c.field] || c.field} from ${fmt(prevFields[c.field].value)} to ${fmt(c.value)} and recalculated.`;
  }
  if (lang === 'hi') return `ठीक है — ${updates.map((u) => HI_LABEL[u.field] || u.field).join(', ')} भर दिया।`;
  return `Got it — noted the ${updates.map((u) => EN_LABEL[u.field] || u.field).join(', ')}.`;
}

function networkLine(lang, net, hospitalName) {
  if (!net) return '';
  const h = net.hospital;
  const where = h ? `${h.name}, ${h.area} (${h.city})` : hospitalName;
  const demo = lang === 'hi' ? ' (डेमो नेटवर्क लिस्ट के हिसाब से)' : ' (per the demo network list)';
  switch (net.status) {
    case 'network': return lang === 'hi' ? `${where} आपकी बीमा कंपनी के नेटवर्क में है${demo}।` : `${where} is in your insurer's network${demo}.`;
    case 'non_network': return lang === 'hi' ? `${where} आपकी बीमा कंपनी के नेटवर्क में नहीं है${demo}, इसलिए यहाँ कैशलेस शायद नहीं मिलेगा।` : `${where} is not in your insurer's network${demo}, so cashless may not be available there.`;
    case 'unknown': return lang === 'hi' ? `“${hospitalName}” नेटवर्क में है या नहीं, ये मैं अभी पक्का नहीं कर पाया — बीमा कंपनी/TPA से वेरिफ़िकेशन बाकी है।` : `I couldn't verify whether “${hospitalName}” is a network hospital — verification with the insurer/TPA is pending.`;
    case 'need_city':
    case 'ambiguous': {
      const opts = net.matches.map((m) => `${m.area}, ${m.city}`).join(' / ');
      return lang === 'hi' ? `“${hospitalName}” नाम के कई अस्पताल हैं (${opts})। कौन सा?` : `There are several “${hospitalName}” hospitals (${opts}). Which one?`;
    }
    default: return '';
  }
}

function claimTypeLine(lang, type) {
  if (type === 'cashless') return lang === 'hi'
    ? 'मरीज़ नेटवर्क अस्पताल में भर्ती हैं, तो कैशलेस इलाज हो सकता है: अस्पताल का इंश्योरेंस डेस्क बीमा कंपनी/TPA को प्री-ऑथराइज़ेशन भेजता है, और उनकी मंज़ूरी के बाद ही कैशलेस मिलता है।'
    : 'Since the patient is admitted at a network hospital, this can be cashless: the hospital’s insurance desk sends a pre-authorisation request to the insurer/TPA, and cashless is subject to their approval.';
  if (type === 'intimation') return lang === 'hi'
    ? 'यहाँ कैशलेस शायद न मिले। सारे बिल और रसीदें संभालकर रखिए — डिस्चार्ज के बाद रिइम्बर्समेंट क्लेम कर सकते हैं (मंज़ूरी बीमा कंपनी देगी)। अभी मैं बीमा कंपनी को सूचना (इंटिमेशन) दर्ज करवा देता हूँ।'
    : 'Cashless may not be available here. Keep every bill and receipt — after discharge you can claim reimbursement (the insurer decides on approval). For now I’ll register an intimation with the insurer.';
  if (type === 'reimbursement') return lang === 'hi'
    ? 'मरीज़ डिस्चार्ज हो चुके हैं, तो ये रिइम्बर्समेंट क्लेम होगा।'
    : 'The patient has been discharged, so this is a reimbursement claim.';
  return '';
}

function completeLine(journey, lang, status) {
  const c = status.computed || {};
  if (journey === 'health_claim') {
    if (status.claimType === 'reimbursement') return lang === 'hi'
      ? `सारी ज़रूरी जानकारी और डॉक्यूमेंट आ गए। बिल ${inr(c.amount)} का है${c.copay ? `, ${inr(c.copay)} को-पे कटेगा` : ''} — अनुमानित भुगतान लगभग ${inr(c.payout)} है। फ़ाइनल रकम बीमा कंपनी तय करेगी। रिव्यू करके सबमिट कीजिए।`
      : `Everything needed is in. The bill is ${inr(c.amount)}${c.copay ? ` and a ${inr(c.copay)} co-pay applies` : ''} — the estimated payout is about ${inr(c.payout)}. The insurer decides the final amount. Please review and submit.`;
    if (status.claimType === 'cashless') return lang === 'hi'
      ? `कैशलेस रिक्वेस्ट के लिए सब तैयार है। अनुमान के हिसाब से बीमा कंपनी लगभग ${inr(c.payout)} दे सकती है और लगभग ${inr(c.youPay)} आपको देना होगा — ये मंज़ूरी पर निर्भर है। रिव्यू करके भेजिए।`
      : `The cashless request is ready. On the estimate, the insurer may cover about ${inr(c.payout)} and you'd pay about ${inr(c.youPay)} — subject to their approval. Please review and send.`;
    return lang === 'hi' ? 'इंटिमेशन के लिए सब तैयार है। रिव्यू करके भेजिए।' : 'The intimation is ready. Please review and send it.';
  }
  const label = lang === 'hi' ? '(ये सिर्फ़ अनुमान है, किसी बैंक का ऑफ़र नहीं)' : '(an indicative estimate, not a lender offer)';
  if (c.outcome === 'indicatively_eligible') return lang === 'hi'
    ? `आपकी जानकारी के हिसाब से आप इस लोन के लिए एलिजिबल दिखते हैं ${label}। EMI लगभग ${inr(c.newEmi)} हर महीने, कुल ब्याज ${inr(c.totalInterest)}। रिव्यू करके आगे बढ़िए।`
    : `Based on what you told me, you look indicatively eligible ${label}. EMI about ${inr(c.newEmi)} a month, total interest ${inr(c.totalInterest)}. Please review.`;
  if (c.outcome === 'lower_amount') return lang === 'hi'
    ? `इस आय पर ये रकम ज़्यादा है। लगभग ${inr(c.maxAmount)} तक की संभावना है${c.tenureNeeded ? `, या ${c.tenureNeeded} महीने की अवधि पर पूरी रकम` : ''} ${label}। रकम या अवधि बदलनी हो तो बताइए, या ऐसे ही रिव्यू कीजिए।`
    : `That amount is high for this income. Indicatively about ${inr(c.maxAmount)} is possible${c.tenureNeeded ? `, or the full amount over ${c.tenureNeeded} months` : ''} ${label}. Tell me a new amount or tenure, or review as is.`;
  return lang === 'hi' ? `कुछ शर्तें पूरी नहीं होतीं — डिटेल फ़ॉर्म में देखिए ${label}।` : `Some criteria aren't met — see the details in the form ${label}.`;
}

export function composeReply({ journey, lang, updates = [], prevFields = {}, prevStatus, status, answer = null, docSummary = null, conflict = null, unreadable = null }) {
  const parts = [];
  if (unreadable) parts.push(unreadable[lang] || unreadable.en);
  if (docSummary) parts.push(docSummary[lang] || docSummary.en);
  else if (!unreadable) { const a = ack(lang, updates, prevFields, journey); if (a) parts.push(a); }
  if (answer) parts.push(answer);

  // newly-identified hospital network status and claim type
  if (journey === 'health_claim') {
    const prevNet = prevStatus?.network?.status;
    const net = status.network;
    if (net && (net.status !== prevNet || (net.hospital?.id !== prevStatus?.network?.hospital?.id))) {
      const line = networkLine(lang, net, prevFields?.hospitalName?.value || updates.find((u) => u.field === 'hospitalName')?.value || net.matches?.[0]?.name);
      if (line && !['need_city', 'ambiguous'].includes(net.status)) parts.push(line);
    }
    if (status.claimType && status.claimType !== prevStatus?.claimType) parts.push(claimTypeLine(lang, status.claimType));
  }

  // a conflict must be resolved before anything else
  if (conflict) {
    parts.push(conflict.question[lang] || conflict.question.en);
    return parts.join(' ');
  }

  // newly raised problems
  const prevIds = new Set((prevStatus?.issues || []).map((i) => i.id));
  const fresh = (status.issues || []).filter((i) => !prevIds.has(i.id) && i.severity !== 'info');
  for (const i of fresh.slice(0, 2)) parts.push(i[lang] || i.en);

  if (status.complete) parts.push(completeLine(journey, lang, status));
  else if (status.next) {
    const n = status.next;
    if (n.kind === 'fix') {
      if (!fresh.some((i) => i.id === n.issue)) {
        const iss = status.issues.find((i) => i.id === n.issue);
        if (iss) parts.push(iss[lang] || iss.en);
      }
    } else if (n.key === 'hospitalCity' && ['need_city', 'ambiguous'].includes(n.reason)) {
      parts.push(networkLine(lang, status.network, prevFields?.hospitalName?.value || updates.find((u) => u.field === 'hospitalName')?.value || status.network.matches[0]?.name));
    } else {
      const key = n.kind === 'doc' ? `doc:${n.key}` : n.key;
      parts.push(ASK[lang][key] || '');
    }
  }
  if (!parts.filter(Boolean).length) parts.push(lang === 'hi' ? 'ज़रा फिर से बताइए?' : 'Could you say that again?');
  return parts.filter(Boolean).join(' ');
}

export function docSummaryText(lang, docType, found, memberMatch) {
  const n = Object.keys(found).length;
  const name = DOC_NAME[lang][docType] || DOC_NAME[lang].other;
  const match = memberMatch === true
    ? (lang === 'hi' ? ' मरीज़ का नाम पॉलिसी के सदस्य से मेल खाता है।' : ' The patient name matches a member on your policy.')
    : memberMatch === false ? (lang === 'hi' ? ' मरीज़ का नाम पॉलिसी में नहीं मिला — जाँच लीजिए।' : ' The patient name isn’t on your policy — please check.') : '';
  return lang === 'hi'
    ? `मैंने आपका ${name} पढ़ लिया — ${n} जानकारी मिली (नीचे देखिए)।${match}`
    : `I've read your ${name} — found ${n} details (shown below).${match}`;
}

export { DOC_NAME };
