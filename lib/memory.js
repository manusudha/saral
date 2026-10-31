// User memory is isolated by Clerk user ID in SQLite.
import { getMemoryFacts, upsertMemory, clearMemory } from './db';

export function remember(facts, sessionId, userId) {
  upsertMemory(facts, sessionId, userId);
}

const PROFILE_FACTS = {
  fullName: 'fullName',
  mobile: 'mobile',
  dob: 'dob',
  pincode: 'pincode',
  city: 'city',
  pan: 'pan',
  employerName: 'employerName',
  businessName: 'businessName',
  workExperienceYears: 'workExperienceYears',
  monthlyIncome: 'monthlyIncome',
  salaryBank: 'salaryBank',
  existingEmi: 'existingEmi',
  creditCardDues: 'creditCardDues',
  disbursalUpi: 'upiId',
  upiId: 'upiId',
};
const REMEMBERABLE_SOURCES = new Set(['account', 'user', 'chat', 'voice', 'document', 'memory']);

export function profileFactsFromFields(fields = {}) {
  const facts = {};
  for (const [field, memoryKey] of Object.entries(PROFILE_FACTS)) {
    const fact = fields[field];
    if (fact && REMEMBERABLE_SOURCES.has(fact.source) && fact.value !== undefined && fact.value !== null && fact.value !== '') {
      facts[memoryKey] = fact.value;
    }
  }
  return facts;
}

export function rememberProfileFromFields(fields, sessionId, userId) {
  const facts = profileFactsFromFields(fields);
  if (Object.keys(facts).length) remember(facts, sessionId, userId);
}

export function resetMemory(userId) {
  clearMemory(userId);
}

// Only account data and facts previously confirmed by this user may prefill a journey.
export function prefillFor(journey, user) {
  const mem = getMemoryFacts(user?.id);
  const f = {};
  const set = (key, value, source) => {
    if (value !== undefined && value !== null && value !== '') f[key] = { value, source, confidence: 1 };
  };
  if (journey === 'health_claim') {
    if (mem.upiId) set('upiId', mem.upiId, 'memory');
  }
  if (journey === 'loan_precheck') {
    if (mem.fullName) set('fullName', mem.fullName, 'memory');
    else set('fullName', user?.fullName, 'account');
    if (mem.mobile) set('mobile', mem.mobile, 'memory');
    else set('mobile', user?.mobile, 'account');
    for (const key of ['dob', 'pincode', 'city', 'businessName', 'workExperienceYears', 'monthlyIncome', 'salaryBank', 'existingEmi', 'creditCardDues']) {
      if (mem[key] !== undefined) set(key, mem[key], 'memory');
    }
    if (mem.employerName) set('employerName', mem.employerName, 'memory');
    if (mem.pan) set('pan', mem.pan, 'memory');
    if (mem.upiId) set('disbursalUpi', mem.upiId, 'memory');
  }
  return f;
}
