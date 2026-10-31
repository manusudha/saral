import basePolicy from '@/data/policy.json';
export const F = (obj, source = 'chat') => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { value: v, source, confidence: 0.9 }]));
export const policy = (patch = {}) => ({ ...basePolicy, ...patch });
export const TODAY = '2026-10-31';
export const BILL_DOCS = { hospitalBill: { id: 'b1', extracted: {} }, dischargeSummary: { id: 'd1', extracted: {} } };
export const discharged = (extra = {}) => F({
  policyNumber: 'PHS-2026-0045127', policyHolder: 'Amit Sharma', relationship: 'Father', patientName: 'Suresh Sharma',
  hospitalName: 'Shanti Care Hospital', hospitalCity: 'Mumbai', admissionStatus: 'Discharged',
  admissionDate: '2026-10-20', dischargeDate: '2026-10-24', diagnosis: 'Dengue fever', claimAmount: 42000, upiId: 'amit@paytm', ...extra,
});
