import { describe, it, expect } from 'vitest';
import { evaluate, emi } from '@/lib/rules';
import { runAgent } from '@/lib/agent';
import { F, TODAY } from './helpers';

const ev = (fields) => evaluate('loan_precheck', fields, {}, { today: TODAY });
const person = { fullName: 'Amit Sharma', mobile: '9876500021', dob: '1994-06-12', pincode: '400069', pan: 'ABCDE1234F', disbursalUpi: 'amit@paytm' };
const salaried = (x = {}) => F({ ...person, employmentType: 'Salaried', employerName: 'TCS', workExperienceYears: 5, monthlyIncome: 60000, existingEmi: 8000, loanAmount: 300000, tenureMonths: 36, ...x });

describe('loan eligibility rules', () => {
  it('EMI uses the reducing-balance formula', () => {
    expect(Math.round(emi(300000, 36, 16))).toBe(10547);
  });

  it('1. salaried with sufficient income → indicatively eligible (never "approved")', () => {
    const s = ev(salaried());
    expect(s.complete).toBe(true);
    expect(s.computed.outcome).toBe('indicatively_eligible');
    expect(s.computed.maxTotalEmi).toBe(30000);
    expect(s.computed.available).toBe(22000);
    expect(s.computed.totalRepayment).toBe(10547 * 36);
    expect(JSON.stringify(s)).not.toMatch(/pre-?approved/i);
  });

  it('2. salaried with income below the minimum → not eligible', () => {
    const s = ev(salaried({ monthlyIncome: 12000, existingEmi: 0, loanAmount: 50000 }));
    expect(s.computed.checks.find((c) => c.id === 'income').pass).toBe(false);
    expect(s.computed.outcome).toBe('not_eligible');
  });

  it('3. self-employed → business name asked, stricter FOIR and income rules', () => {
    const s = ev(F({ ...person, employmentType: 'Self-employed', workExperienceYears: 3, monthlyIncome: 80000, existingEmi: 0, loanAmount: 300000, tenureMonths: 36 }));
    expect(s.required).toContain('businessName');
    expect(s.required).not.toContain('employerName');
    expect(s.computed.foirMax).toBe(0.45);
  });

  it('4. existing EMIs already over FOIR → not affordable', () => {
    const s = ev(salaried({ existingEmi: 32000 }));
    expect(s.computed.available).toBeLessThan(0);
    expect(s.computed.checks.find((c) => c.id === 'foir').pass).toBe(false);
  });

  it('5. tenure outside the permitted range → blocks and asks again', () => {
    const s = ev(salaried({ tenureMonths: 72 }));
    expect(s.issues.find((i) => i.id === 'tenure_out_of_range').severity).toBe('block');
    expect(s.next).toMatchObject({ kind: 'fix', key: 'tenureMonths' });
  });

  it('6. amount above affordability → suggests a lower amount or longer tenure, request unchanged', () => {
    const f = salaried({ monthlyIncome: 45000, existingEmi: 0, loanAmount: 500000, tenureMonths: 24 });
    const s = ev(f);
    expect(s.computed.outcome).toBe('lower_amount');
    expect(s.computed.maxAmount).toBeLessThan(500000);
    expect(s.computed.tenureNeeded).toBeGreaterThan(24);
    expect(f.loanAmount.value).toBe(500000);
  });

  it('7. invalid PAN → blocks', () => {
    const s = ev(salaried({ pan: 'ABC123' }));
    expect(s.issues.find((i) => i.id === 'pan_invalid').severity).toBe('block');
    expect(s.complete).toBe(false);
  });

  it('8. missing income → no calculation yet, asks for it', () => {
    const f = salaried(); delete f.monthlyIncome;
    const s = ev(f);
    expect(s.computed.newEmi).toBeUndefined();
    expect(s.missingFields).toContain('monthlyIncome');
  });
});

describe('loan conversation (offline engine)', () => {
  it('10. several answers in one sentence', async () => {
    const r = await runAgent({ journey: 'loan_precheck', fields: {}, text: 'Mujhe 3 lakh ka loan chahiye, meri salary 60 hazar hai aur 8 hazar ki ek EMI chal rahi hai', lang: 'hi' });
    expect(r.fields.loanAmount.value).toBe(300000);
    expect(r.fields.monthlyIncome.value).toBe(60000);
    expect(r.fields.existingEmi.value).toBe(8000);
  });

  it('9. user changes income after calculation → updated, recalculated, no duplicate', async () => {
    const f = salaried();
    const before = ev(f).computed.foir;
    const r = await runAgent({ journey: 'loan_precheck', fields: f, text: 'Actually meri salary 50 hazar hai', lang: 'hi' });
    expect(r.fields.monthlyIncome.value).toBe(50000);
    expect(r.status.computed.foir).toBeGreaterThan(before);
    expect(r.reply).toMatch(/60,000/);
  });

  it('English: "I earn 45000 per month and want 5 lakh for 36 months"', async () => {
    const r = await runAgent({ journey: 'loan_precheck', fields: {}, text: 'I earn 45000 per month and want 5 lakh for 36 months', lang: 'en' });
    expect(r.fields.monthlyIncome.value).toBe(45000);
    expect(r.fields.loanAmount.value).toBe(500000);
    expect(r.fields.tenureMonths.value).toBe(36);
  });
});
