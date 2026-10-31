import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { greeting } from '../lib/replies';
import { mockAnswer } from '../lib/mockExtract';
import { prefillFor, profileFactsFromFields, rememberProfileFromFields } from '../lib/memory';

const originalDbPath = process.env.DB_PATH;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saral-user-data-'));
const dbPath = path.join(tempDir, 'saral.db');
let dbApi;

beforeAll(async () => {
  const legacyDb = new Database(dbPath);
  legacyDb.exec(`CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    journey TEXT NOT NULL,
    lang TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    ai_mode TEXT,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  legacyDb.prepare(`INSERT INTO sessions (id, journey, started_at, updated_at)
                    VALUES ('legacy-session', 'loan_precheck', '2025-01-01', '2025-01-01')`).run();
  legacyDb.close();

  process.env.DB_PATH = dbPath;
  dbApi = await import('../lib/db');
});

afterAll(() => {
  if (globalThis.__saralDb) {
    globalThis.__saralDb.close();
    delete globalThis.__saralDb;
  }
  if (originalDbPath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = originalDbPath;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('user-owned session data', () => {
  it('migrates legacy sessions and isolates memory, submissions, and resets by user', () => {
    const db = dbApi.getDb();
    const columns = db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name);
    expect(columns).toContain('user_id');
    expect(columns).toContain('state');
    expect(dbApi.loadSession('legacy-session', 'user-a')).toBeNull();

    const sessionA = dbApi.createSession({ journey: 'loan_precheck', lang: 'en', aiMode: 'offline', userId: 'user-a' });
    const sessionB = dbApi.createSession({ journey: 'loan_precheck', lang: 'en', aiMode: 'offline', userId: 'user-b' });
    const fieldsA = { fullName: { value: 'Alex A', source: 'user' } };
    const fieldsB = { fullName: { value: 'Blair B', source: 'user' } };
    dbApi.saveSessionState(sessionA, { fields: fieldsA, docs: {}, pending: null, lang: 'en' });
    dbApi.saveSessionState(sessionB, { fields: fieldsB, docs: {}, pending: null, lang: 'en' });

    const submission = (id, sessionId, userId, fields, name) => dbApi.saveSubmission({
      id,
      sessionId,
      userId,
      journey: 'loan_precheck',
      status: 'Indicatively eligible',
      headline: 'Indicatively eligible',
      amount: 10000,
      amountLabel: 'Indicative EMI',
      fields,
      computed: {},
      timeline: [],
      n8nStatus: 'pending',
      memoryFacts: { fullName: name },
    });

    expect(submission('submission-a', sessionA, 'user-a', fieldsA, 'Alex A')).toBe(true);
    expect(submission('submission-b', sessionB, 'user-b', fieldsB, 'Blair B')).toBe(true);
    expect(dbApi.loadSession(sessionA, 'user-b')).toBeNull();
    expect(dbApi.listSubmissions('user-a').map((row) => row.id)).toEqual(['submission-a']);
    expect(dbApi.listSubmissions('user-b').map((row) => row.id)).toEqual(['submission-b']);
    expect(dbApi.getSubmissionDetail('submission-b', 'user-a')).toBeNull();
    expect(dbApi.getMemoryFacts('user-a')).toEqual({ fullName: 'Alex A' });
    expect(dbApi.getMemoryFacts('user-b')).toEqual({ fullName: 'Blair B' });
    expect(submission('forbidden', sessionB, 'user-a', fieldsB, 'Incorrect owner')).toBe(false);

    dbApi.clearAll('user-a');
    expect(dbApi.loadSession(sessionA, 'user-a')).toBeNull();
    expect(dbApi.listSubmissions('user-a')).toEqual([]);
    expect(dbApi.getMemoryFacts('user-a')).toEqual({});
    expect(dbApi.listSubmissions('user-b').map((row) => row.id)).toEqual(['submission-b']);
    expect(dbApi.getMemoryFacts('user-b')).toEqual({ fullName: 'Blair B' });
  });
});

describe('account-specific greetings', () => {
  it('uses the signed-in name without claiming demo profile or policy data was loaded', () => {
    const reply = greeting('loan_precheck', 'en', [], 'Sam User');
    expect(reply).toContain('Hi Sam!');
    expect(reply).not.toMatch(/Amit|DOB|PIN from your account|loaded your policy/i);
  });

  it('remembers only user-owned profile facts and prefills them only for that Clerk account', () => {
    const sessionId = dbApi.createSession({ journey: 'loan_precheck', lang: 'en', aiMode: 'offline', userId: 'user-memory-a' });
    const facts = profileFactsFromFields({
      fullName: { value: 'Riya User', source: 'chat' },
      monthlyIncome: { value: 72000, source: 'user' },
      patientName: { value: 'Family Member', source: 'document' },
      policyHolder: { value: 'Sample Holder', source: 'policy' },
    });
    expect(facts).toEqual({ fullName: 'Riya User', monthlyIncome: 72000 });
    rememberProfileFromFields({
      fullName: { value: 'Riya User', source: 'chat' },
      monthlyIncome: { value: 72000, source: 'user' },
    }, sessionId, 'user-memory-a');

    expect(prefillFor('loan_precheck', { id: 'user-memory-a', fullName: 'Clerk Name' })).toMatchObject({
      fullName: { value: 'Riya User', source: 'memory' },
      monthlyIncome: { value: 72000, source: 'memory' },
    });
    expect(prefillFor('loan_precheck', { id: 'user-memory-b', fullName: 'Other User' })).toMatchObject({
      fullName: { value: 'Other User', source: 'account' },
    });
    expect(prefillFor('loan_precheck', { id: 'user-memory-b', fullName: 'Other User' })).not.toHaveProperty('monthlyIncome');
    dbApi.clearAll('user-memory-a');
  });

  it('answers policy FAQs without inventing personal terms from demo data', () => {
    expect(mockAnswer('health_claim', 'What is my copay?', 'en')).toMatch(/depends on your policy/i);
    expect(mockAnswer('health_claim', 'What is my room rent limit?', 'en')).toMatch(/vary by policy/i);
  });
});