// User memory: facts confirmed in one journey and reused in the next.
// Stored in the SQLite `memory` table (see lib/db.js). Swap for Cognee here if you want.
import profile from '@/data/profile.json';
import policy from '@/data/policy.json';
import { getMemoryFacts, upsertMemory, clearMemory } from './db';

export function remember(facts, sessionId) {
  upsertMemory(facts, sessionId);
}

export function resetMemory() {
  clearMemory();
}

// Where each prefilled field comes from. "account" = the logged-in Paytm account / linked policy,
// "memory" = something the user confirmed in an earlier journey.
export function prefillFor(journey) {
  const mem = getMemoryFacts();
  const f = {};
  const set = (key, value, source) => {
    if (value !== undefined && value !== null && value !== '') f[key] = { value, source, confidence: 1 };
  };
  if (journey === 'health_claim') {
    set('policyNumber', policy.policyNumber, 'policy');
    set('policyHolder', policy.policyHolder, 'policy');
    if (mem.upiId) set('upiId', mem.upiId, 'memory');
    else set('upiId', profile.upiId, 'account');
  }
  if (journey === 'loan_precheck') {
    set('fullName', mem.fullName || profile.fullName, mem.fullName ? 'memory' : 'account');
    set('mobile', profile.mobile, 'account');
    set('dob', profile.dob, 'account');
    set('pincode', profile.pincode, 'account');
    if (mem.employerName) set('employerName', mem.employerName, 'memory');
    if (mem.pan) set('pan', mem.pan, 'memory');
    if (mem.upiId) set('disbursalUpi', mem.upiId, 'memory');
    else set('disbursalUpi', profile.upiId, 'account');
  }
  return f;
}
