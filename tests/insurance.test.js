import { describe, it, expect } from 'vitest';
import { evaluate } from '@/lib/rules';
import { lookupHospital } from '@/lib/network';
import { runAgent } from '@/lib/agent';
import { F, policy, TODAY, BILL_DOCS, discharged } from './helpers';

const ev = (fields, docs = {}, p) => evaluate('health_claim', fields, docs, { today: TODAY, ...(p ? { policy: p } : {}) });
const base = { policyNumber: 'PHS-2026-0045127', policyHolder: 'Amit Sharma', relationship: 'Father', patientName: 'Suresh Sharma' };

describe('health insurance rules', () => {
  it('1. network hospital + currently admitted → cashless', () => {
    const s = ev(F({ ...base, hospitalName: 'Apollo', hospitalCity: 'Chennai', admissionStatus: 'Currently admitted' }));
    expect(s.network.status).toBe('network');
    expect(s.claimType).toBe('cashless');
    expect(s.required).toContain('estimatedCost');
    expect(s.required).not.toContain('dischargeDate');
  });

  it('2. non-network hospital + admitted → intimation, not cashless', () => {
    const s = ev(F({ ...base, hospitalName: 'Lilavati Hospital', hospitalCity: 'Mumbai', admissionStatus: 'Currently admitted' }));
    expect(s.network.status).toBe('non_network');
    expect(s.claimType).toBe('intimation');
  });

  it('3. discharged → reimbursement and asks for the bill first', () => {
    const s = ev(F({ ...base, hospitalName: 'Fortis', hospitalCity: 'Mumbai', admissionStatus: 'Discharged', cashlessStatus: 'Not used' }));
    expect(s.claimType).toBe('reimbursement');
    expect(s.next).toEqual({ kind: 'doc', key: 'hospitalBill' });
    expect(s.requiredDocs).toEqual(['hospitalBill', 'dischargeSummary']);
  });

  it('4. cashless rejected → asks for the reason, reimbursement path', () => {
    const s = ev(F({ ...base, hospitalName: 'Fortis', hospitalCity: 'Mumbai', admissionStatus: 'Discharged', cashlessStatus: 'Rejected' }));
    expect(s.claimType).toBe('reimbursement');
    expect(s.next).toEqual({ kind: 'field', key: 'cashlessRejectionReason' });
    expect(s.optionalDocs).toContain('rejectionLetter');
  });

  it('5. patient not covered → blocking issue with a follow-up question', () => {
    const s = ev(F({ policyNumber: 'X', policyHolder: 'Amit Sharma', relationship: 'Brother' }));
    const i = s.issues.find((x) => x.id === 'member_not_covered');
    expect(i.severity).toBe('block');
    expect(i.en).toMatch(/another policy/);
    expect(s.complete).toBe(false);
  });

  it('7. admission later than discharge → blocks and asks to confirm dates', () => {
    const s = ev(discharged({ admissionDate: '2026-10-25', dischargeDate: '2026-10-20' }), BILL_DOCS);
    expect(s.issues.find((x) => x.id === 'dates_reversed').severity).toBe('block');
    expect(s.complete).toBe(false);
  });

  it('8/9. missing hospital bill / discharge summary are required documents', () => {
    const noBill = ev(discharged(), { dischargeSummary: { id: 'd' } });
    expect(noBill.missingDocs).toEqual(['hospitalBill']);
    const noSummary = ev(discharged(), { hospitalBill: { id: 'b' } });
    expect(noSummary.missingDocs).toEqual(['dischargeSummary']);
    expect(noSummary.complete).toBe(false);
  });

  it('happy path: ₹42,000 bill for father → 10% co-pay → ₹37,800 estimate', () => {
    const s = ev(discharged(), BILL_DOCS);
    expect(s.complete).toBe(true);
    expect(s.computed.payout).toBe(37800);
    expect(s.breakdown.at(-1).amount).toBe(37800);
  });

  it('10. remaining sum insured insufficient → payout capped and shortfall explained', () => {
    const s = ev(discharged({ claimAmount: 600000 }), BILL_DOCS, policy({ sumInsuredUsed: 450000 }));
    expect(s.computed.remaining).toBe(50000);
    expect(s.computed.payout).toBe(50000);
    expect(s.issues.some((i) => i.id === 'sum_insured_short')).toBe(true);
  });

  it('11. policy expired → blocks', () => {
    const s = ev(discharged(), BILL_DOCS, policy({ endDate: '2026-10-01' }));
    expect(s.issues.some((i) => i.id === 'policy_expired' && i.severity === 'block')).toBe(true);
    expect(s.complete).toBe(false);
  });

  it('12. possibly excluded treatment is flagged for review, not decided', () => {
    const s = ev(discharged({ diagnosis: 'Dental root canal' }), BILL_DOCS);
    const i = s.issues.find((x) => x.id.startsWith('exclusion_'));
    expect(i.severity).toBe('warn');
    expect(s.complete).toBe(true);
  });

  it('12b. waiting period: mother covered since Apr 2026, cataract needs 2 years → flagged', () => {
    const s = ev(discharged({ relationship: 'Mother', patientName: 'Kamla Sharma', diagnosis: 'Cataract surgery' }), BILL_DOCS);
    expect(s.issues.some((i) => i.id === 'waiting_730')).toBe(true);
  });

  it('13. room rent above limit → excess deducted in the breakdown', () => {
    const docs = { ...BILL_DOCS, hospitalBill: { id: 'b', extracted: { roomRentPerDay: 7000 } } };
    const s = ev(discharged(), docs);
    expect(s.issues.some((i) => i.id === 'room_rent_exceeded')).toBe(true);
    // 4 days × ₹2,000 over the cap = ₹8,000 off, then 10% co-pay
    expect(s.computed.admissible).toBe(34000);
    expect(s.computed.payout).toBe(30600);
  });

  it('14. submission deadline from the POLICY (not hardcoded 60 days)', () => {
    const late = evaluate('health_claim', discharged(), BILL_DOCS, { today: '2026-12-10' });
    expect(late.issues.some((i) => i.id === 'submission_late')).toBe(true);
    const longerPolicy = evaluate('health_claim', discharged(), BILL_DOCS, { today: '2026-12-10', policy: policy({ claimRules: { ...policy().claimRules, reimbursementSubmissionDays: 90 } }) });
    expect(longerPolicy.issues.some((i) => i.id === 'submission_late')).toBe(false);
  });

  it('15. hospital name with several branches → asks which city', () => {
    expect(lookupHospital({ name: 'Apollo Hospital', networkId: 'DEMO-NET-1' }).status).toBe('need_city');
    const s = ev(F({ ...base, hospitalName: 'Apollo Hospital', admissionStatus: 'Currently admitted' }));
    expect(s.next.key).toBe('hospitalCity');
    expect(s.claimType).toBe(null); // never decide cashless before the hospital is known
  });

  it('unknown hospital → verification pending, never claimed as network', () => {
    const r = lookupHospital({ name: 'Sunrise Nursing Home', city: 'Pune', networkId: 'DEMO-NET-1' });
    expect(r.status).toBe('unknown');
  });
});

describe('conversation + documents (offline engine)', () => {
  it('extracts several fields from one Hinglish sentence', async () => {
    const r = await runAgent({ journey: 'health_claim', fields: {}, text: 'Mere papa ko dengue ho gaya hai aur unko Mumbai ke Apollo Hospital mein admit kiya hai', lang: 'hi' });
    expect(r.fields.relationship.value).toBe('Father');
    expect(r.fields.diagnosis.value).toBe('Dengue');
    expect(r.fields.hospitalName.value).toBe('Apollo Hospitals');
    expect(r.fields.hospitalCity.value).toBe('Mumbai');
    expect(r.fields.admissionStatus.value).toBe('Currently admitted');
    expect(r.fields.patientName).toBeUndefined();
  });

  it('6. bill amount differs from what the user said → asks, does not overwrite', async () => {
    const said = await runAgent({ journey: 'health_claim', fields: {}, text: 'Papa dengue se admit the, 40 hazar ka bill aaya. Shanti Care hospital Mumbai, discharge ho gaye', lang: 'hi' });
    expect(said.fields.claimAmount.value).toBe(40000);
    const fs = await import('fs');
    const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync('public/samples/hospital-bill.jpg').toString('base64');
    const r = await runAgent({ journey: 'health_claim', fields: said.fields, docs: said.docs, file: { dataUrl, name: 'hospital-bill.jpg' }, lang: 'en' });
    expect(r.pending.field).toBe('claimAmount');
    expect(r.fields.claimAmount.value).toBe(40000); // not silently replaced
    const chosen = await runAgent({ journey: 'health_claim', fields: r.fields, docs: r.docs, pending: r.pending, choice: 0, lang: 'en' });
    expect(chosen.fields.claimAmount.value).toBe(42000);
    expect(chosen.fields.claimAmount.source).toBe('document');
    expect(chosen.pending).toBe(null);
  });

  it('unsupported file type is rejected with a clear message', async () => {
    const r = await runAgent({ journey: 'health_claim', fields: {}, file: { dataUrl: 'data:text/plain;base64,aGVsbG8=', name: 'notes.txt' }, lang: 'en' });
    expect(r.reply).toMatch(/JPG, PNG or PDF/);
    expect(Object.keys(r.docs)).toHaveLength(0);
  });

  it('without an AI key, an unknown document is NOT faked', async () => {
    const r = await runAgent({ journey: 'health_claim', fields: {}, file: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', name: 'IMG_2041.png' }, lang: 'en' });
    expect(r.reply).toMatch(/no AI key/i);
    expect(Object.keys(r.docs)).toHaveLength(0);
  });
});
