import { describe, it, expect, afterEach, vi } from 'vitest';
import { runAgent, clean } from '@/lib/agent';
import { fieldDef, SCHEMAS } from '@/lib/schemas';

afterEach(() => { vi.unstubAllGlobals(); delete process.env.LLM_API_KEY; delete process.env.LLM_BASE_URL; delete process.env.LLM_MODEL; });
const useFakeAI = (content, ok = true) => {
  process.env.LLM_API_KEY = 'k'; process.env.LLM_BASE_URL = 'http://fake'; process.env.LLM_MODEL = 'm';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status: ok ? 200 : 500, text: async () => 'boom', json: async () => ({ choices: [{ message: { content } }] }) })));
};

describe('AI layer safety', () => {
  it('AI provider failure → falls back to the offline extractor', async () => {
    useFakeAI('', false);
    const r = await runAgent({ journey: 'loan_precheck', fields: {}, text: 'Mujhe 2 lakh ka loan chahiye', lang: 'hi' });
    expect(r.usedAI).toBe(false);
    expect(r.fields.loanAmount.value).toBe(200000);
  });

  it('malformed AI response → falls back, nothing crashes', async () => {
    useFakeAI('not json at all');
    const r = await runAgent({ journey: 'loan_precheck', fields: {}, text: 'salary 50 hazar', lang: 'hi' });
    expect(r.fields.monthlyIncome.value).toBe(50000);
  });

  it('AI values are validated: unknown fields and bad types are dropped', async () => {
    useFakeAI(JSON.stringify({ updates: [{ field: 'loanAmount', value: 'lots' }, { field: 'hackField', value: 1 }, { field: 'tenureMonths', value: '24' }], lang: 'en' }));
    const r = await runAgent({ journey: 'loan_precheck', fields: {}, text: 'whatever', lang: 'en' });
    expect(r.usedAI).toBe(true);
    expect(r.fields.loanAmount).toBeUndefined();
    expect(r.fields.hackField).toBeUndefined();
    expect(r.fields.tenureMonths.value).toBe(24);
  });

  it('clean() normalises enums and rejects bad dates', () => {
    const s = SCHEMAS.health_claim;
    expect(clean(fieldDef(s, 'admissionStatus'), 'admitted')).toBe('Currently admitted');
    expect(clean(fieldDef(s, 'admissionDate'), '31/02/2026')).toBeUndefined();
  });
});
