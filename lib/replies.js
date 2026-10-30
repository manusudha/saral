// What Saral says. Templates (not the AI) write the questions and the money lines,
// so replies are fast, consistent and never invent numbers.
import { inr } from './format';
import profile from '@/data/profile.json';

const firstName = profile.fullName.split(' ')[0];
const firstNameHi = profile.firstNameHi || firstName;

const HI_LABEL = {
  policyNumber: 'पॉलिसी नंबर', policyHolder: 'पॉलिसी होल्डर', patientName: 'मरीज़ का नाम', relationship: 'रिश्ता',
  hospitalName: 'अस्पताल', admissionDate: 'भर्ती की तारीख़', dischargeDate: 'डिस्चार्ज की तारीख़', diagnosis: 'बीमारी',
  claimAmount: 'क्लेम की रकम', upiId: 'UPI ID', fullName: 'नाम', mobile: 'मोबाइल', pan: 'PAN',
  employmentType: 'काम', monthlyIncome: 'मासिक आय', existingEmi: 'मौजूदा EMI', loanAmount: 'लोन की रकम',
  tenureMonths: 'अवधि', purpose: 'मकसद', disbursalUpi: 'UPI ID',
};

const ASK = {
  hi: {
    relationship: 'मरीज़ आपके क्या लगते हैं — पिताजी, माताजी, पत्नी या आप ख़ुद?',
    patientName: 'मरीज़ का पूरा नाम बताइए।',
    hospitalName: 'किस अस्पताल में भर्ती थे?',
    admissionDate: 'भर्ती किस तारीख़ को हुए थे?',
    dischargeDate: 'डिस्चार्ज किस तारीख़ को हुआ?',
    diagnosis: 'क्या बीमारी थी?',
    claimAmount: 'कुल बिल कितने का था?',
    upiId: 'पैसे किस UPI ID पर भेजूँ?',
    policyNumber: 'पॉलिसी नंबर बताइए।',
    policyHolder: 'पॉलिसी किसके नाम पर है?',
    'doc:hospitalBill': 'अब अस्पताल के फ़ाइनल बिल की फ़ोटो भेजिए — अस्पताल, तारीख़ें और रकम मैं उसी से भर दूँगा।',
    'doc:dischargeSummary': 'बस एक चीज़ बाकी है — डिस्चार्ज समरी की फ़ोटो भेजिए।',
    loanAmount: 'कितने का लोन चाहिए?',
    employmentType: 'आप नौकरी करते हैं या अपना काम/बिज़नेस?',
    monthlyIncome: 'हर महीने कितनी कमाई होती है?',
    existingEmi: 'अभी कोई EMI चल रही है? हो तो हर महीने कितनी?',
    tenureMonths: 'कितने महीनों में चुकाना चाहेंगे — 12, 24 या 36?',
    pan: 'अपना PAN नंबर बताइए।',
    fullName: 'आपका पूरा नाम?',
    mobile: 'आपका मोबाइल नंबर?',
    disbursalUpi: 'लोन किस UPI ID पर चाहिए?',
  },
  en: {
    relationship: 'How is the patient related to you — father, mother, spouse, or yourself?',
    patientName: "What is the patient's full name?",
    hospitalName: 'Which hospital were they admitted to?',
    admissionDate: 'On what date were they admitted?',
    dischargeDate: 'On what date were they discharged?',
    diagnosis: 'What was the illness or diagnosis?',
    claimAmount: 'What was the total bill amount?',
    upiId: 'Which UPI ID should the money go to?',
    policyNumber: 'What is your policy number?',
    policyHolder: 'Whose name is the policy in?',
    'doc:hospitalBill': "Please send a photo of the final hospital bill — I'll fill the hospital, dates and amount from it.",
    'doc:dischargeSummary': 'Just one thing left — please send a photo of the discharge summary.',
    loanAmount: 'How much would you like to borrow?',
    employmentType: 'Are you salaried or self-employed?',
    monthlyIncome: 'What is your monthly income?',
    existingEmi: 'Do you have any EMIs running right now? If yes, how much a month?',
    tenureMonths: 'Over how many months would you like to repay — 12, 24 or 36?',
    pan: 'What is your PAN number?',
    fullName: 'What is your full name?',
    mobile: 'What is your mobile number?',
    disbursalUpi: 'Which UPI ID should the loan go to?',
  },
};

export function greeting(journey, lang, prefilledKeys = [], memorySources = []) {
  if (journey === 'health_claim') {
    return lang === 'hi'
      ? `नमस्ते ${firstNameHi} जी! मैं सरल हूँ। आपकी पॉलिसी और UPI मैंने पहले से भर दी है। बताइए, किसका इलाज हुआ और क्या हुआ था? बोलकर या लिखकर बताइए।`
      : `Hi ${firstName}! I'm Saral. I've already filled in your policy and UPI. Tell me who was treated and what happened — speak or type.`;
  }
  const remembered = memorySources.length
    ? (lang === 'hi' ? ' कुछ जानकारी पिछली बार से याद है, वो भी भर दी है।' : ' I also remembered a few details from last time.')
    : '';
  return lang === 'hi'
    ? `नमस्ते ${firstNameHi} जी! आपका नाम और मोबाइल मैंने भर दिया है।${remembered} बताइए, कितने का लोन चाहिए?`
    : `Hi ${firstName}! I've filled in your name and mobile.${remembered} How much would you like to borrow?`;
}

function ack(lang, updates, docKey, matched = 0) {
  if (docKey && !updates.length) {
    const what = docKey === 'dischargeSummary' ? (lang === 'hi' ? 'डिस्चार्ज समरी' : 'The discharge summary') : (lang === 'hi' ? 'डॉक्यूमेंट' : 'The document');
    return lang === 'hi'
      ? `${what} मिल गई — इसकी ${matched} जानकारी बिल से मेल खाती है ✓`
      : `${what} matches the bill on ${matched} details ✓`;
  }
  if (docKey) {
    const docName = lang === 'hi'
      ? (docKey === 'hospitalBill' ? 'बिल' : docKey === 'dischargeSummary' ? 'डिस्चार्ज समरी' : 'डॉक्यूमेंट')
      : (docKey === 'hospitalBill' ? 'the bill' : docKey === 'dischargeSummary' ? 'the discharge summary' : 'the document');
    return lang === 'hi'
      ? `${docName} पढ़ लिया — ${updates.length} जानकारी भर दी।`
      : `Read ${docName} — filled ${updates.length} field${updates.length === 1 ? '' : 's'}.`;
  }
  if (!updates.length) return '';
  if (lang === 'hi') return `ठीक है — ${updates.map((u) => HI_LABEL[u.field] || u.field).join(', ')} भर दिया।`;
  return 'Got it.';
}

function completeLine(journey, lang, status) {
  const c = status.computed || {};
  if (journey === 'health_claim') {
    if (lang === 'hi') {
      const copay = c.copayApplies ? ` माता-पिता के क्लेम पर 10% को-पे लगता है, इसलिए` : '';
      return `सब जानकारी पूरी है। बिल ${inr(c.amount)} का है।${copay} आपको लगभग ${inr(c.payout)} मिलेंगे। एक बार रिव्यू करके सबमिट कीजिए।`;
    }
    const copay = c.copayApplies ? ' A 10% co-pay applies for parents, so' : '';
    return `Everything is filled in. The bill is ${inr(c.amount)}.${copay} you should receive about ${inr(c.payout)}. Please review and submit.`;
  }
  if (c.eligible) {
    return lang === 'hi'
      ? `अच्छी ख़बर — आप इस लोन के लिए एलिजिबल हैं। EMI लगभग ${inr(c.newEmi)} हर महीने होगी, ${c.rate}% सालाना ब्याज पर। रिव्यू करके आगे बढ़िए।`
      : `Good news — you're eligible. Your EMI would be about ${inr(c.newEmi)} a month at ${c.rate}% a year. Review and continue.`;
  }
  if (c.maxAmount !== undefined) {
    return lang === 'hi'
      ? `इस आय पर ये रकम थोड़ी ज़्यादा है। आप लगभग ${inr(c.maxAmount)} तक का लोन ले सकते हैं। रकम बदलनी हो तो बताइए, या रिव्यू कीजिए।`
      : `That amount is a bit high for this income. You can borrow up to about ${inr(c.maxAmount)}. Tell me a new amount, or review.`;
  }
  return lang === 'hi' ? 'सब जानकारी पूरी है। रिव्यू कीजिए।' : 'Everything is filled in. Please review.';
}

export function composeReply({ journey, lang, updates = [], docKey = null, answer = null, conflicts = [], status, unreadable = false, matched = 0 }) {
  const parts = [];
  if (unreadable) {
    parts.push(lang === 'hi' ? 'माफ़ कीजिए, ये फ़ोटो साफ़ नहीं पढ़ पाया। थोड़ी रोशनी में दोबारा फ़ोटो भेजिए।' : "Sorry, I couldn't read that photo. Please retake it in better light.");
  } else {
    const a = ack(lang, updates, docKey, matched);
    if (a) parts.push(a);
  }
  if (answer) parts.push(answer);
  for (const c of conflicts) parts.push(c[lang]);
  if (status.complete) parts.push(completeLine(journey, lang, status));
  else if (status.next) {
    const key = status.next.kind === 'doc' ? `doc:${status.next.key}` : status.next.key;
    parts.push(ASK[lang][key] || '');
  }
  if (!parts.length) parts.push(lang === 'hi' ? 'ज़रा फिर से बताइए?' : 'Could you say that again?');
  return parts.join(' ');
}

export { HI_LABEL };
