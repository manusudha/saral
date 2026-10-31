import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMemoryToken,
  createSessionToken,
  readMemoryToken,
  readSessionToken,
} from '../lib/statelessSession';

const originalSecret = process.env.CLERK_SECRET_KEY;

beforeAll(() => {
  process.env.CLERK_SECRET_KEY = 'test-secret-for-stateless-session';
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = originalSecret;
});

describe('encrypted stateless tokens', () => {
  it('encrypts session state and binds it to the signed-in user', () => {
    const state = { fields: { fullName: { value: 'Riya Example', source: 'user' } }, docs: {}, pending: null, lang: 'en' };
    const token = createSessionToken({ id: 'session-1', userId: 'user-a', journey: 'loan_precheck', state });

    expect(token).not.toContain('Riya Example');
    expect(readSessionToken(token, 'user-a')).toMatchObject({ id: 'session-1', journey: 'loan_precheck', state });
    expect(readSessionToken(token, 'user-b')).toBeNull();
    const tampered = `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`;
    expect(readSessionToken(tampered, 'user-a')).toBeNull();
  });

  it('keeps remembered facts encrypted and user-bound', () => {
    const token = createMemoryToken('user-a', { fullName: 'Riya Example', monthlyIncome: 72000 });

    expect(token).not.toContain('Riya Example');
    expect(readMemoryToken(token, 'user-a')).toEqual({ fullName: 'Riya Example', monthlyIncome: 72000 });
    expect(readMemoryToken(token, 'user-b')).toEqual({});
  });
});
