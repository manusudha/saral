// SQLite database (one file: data/saral.db). Created automatically on first use.
// Tables:
//   sessions     one row per journey a user starts
//   messages     full chat transcript (user + Saral)
//   field_events audit log: every value written to the form — by the AI, the user, or the system
//   documents    every photo read, with what the AI extracted
//   submissions  submitted claims / loan pre-checks
//   memory       facts remembered across journeys (name, UPI, PAN …)
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const DEFAULT_DB_PATH = process.env.VERCEL
  ? path.join(os.tmpdir(), 'saral.db')
  : path.join(process.cwd(), 'data', 'saral.db');
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  journey     TEXT NOT NULL,
  lang        TEXT,
  status      TEXT NOT NULL DEFAULT 'active',      -- active | submitted
  ai_mode     TEXT,                                 -- live | offline
  started_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  role        TEXT NOT NULL,                        -- user | saral
  kind        TEXT NOT NULL,                        -- text | voice | doc
  text        TEXT,
  lang        TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS field_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  field       TEXT NOT NULL,
  old_value   TEXT,                                 -- JSON
  new_value   TEXT,                                 -- JSON
  source      TEXT NOT NULL,                        -- voice | chat | document | account | memory | user
  actor       TEXT NOT NULL,                        -- ai | user | system
  confidence  REAL,
  evidence    TEXT,                                 -- what it was based on: transcript, file name, rule
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  doc_type    TEXT,                                 -- hospitalBill | dischargeSummary | other
  file_name   TEXT,
  extracted   TEXT,                                 -- JSON of fields read from the photo
  read_by     TEXT,                                 -- ai | offline
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id          TEXT PRIMARY KEY,                     -- CLM-… / LPC-…
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  journey     TEXT NOT NULL,
  status      TEXT NOT NULL,                        -- e.g. Under insurer review / Pre-approved
  headline    TEXT,
  amount      REAL,
  amount_label TEXT,
  fields      TEXT NOT NULL,                        -- JSON snapshot of the final form
  computed    TEXT,                                 -- JSON (payout, co-pay, EMI …)
  timeline    TEXT,                                 -- JSON
  n8n_status  TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory (
  key            TEXT PRIMARY KEY,
  value          TEXT NOT NULL,
  source_session TEXT,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_memory (
  user_id        TEXT NOT NULL,
  key            TEXT NOT NULL,
  value          TEXT NOT NULL,
  source_session TEXT,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
CREATE INDEX IF NOT EXISTS idx_events_session   ON field_events(session_id, id);
CREATE INDEX IF NOT EXISTS idx_docs_session     ON documents(session_id, id);
CREATE INDEX IF NOT EXISTS idx_subs_created     ON submissions(created_at);
`;

export function getDb() {
  if (globalThis.__saralDb) return globalThis.__saralDb;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // migrations for databases created by earlier versions
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  if (!cols('sessions').includes('user_id')) db.exec('ALTER TABLE sessions ADD COLUMN user_id TEXT');
  if (!cols('sessions').includes('state')) db.exec('ALTER TABLE sessions ADD COLUMN state TEXT');
  if (!cols('field_events').includes('doc_id')) db.exec('ALTER TABLE field_events ADD COLUMN doc_id TEXT');
  if (!cols('field_events').includes('page')) db.exec('ALTER TABLE field_events ADD COLUMN page INTEGER');
  if (!cols('documents').includes('doc_id')) db.exec('ALTER TABLE documents ADD COLUMN doc_id TEXT');
  if (!cols('documents').includes('page')) db.exec('ALTER TABLE documents ADD COLUMN page INTEGER');
  globalThis.__saralDb = db;
  return db;
}

const now = () => new Date().toISOString();
const j = (v) => (v === undefined ? null : JSON.stringify(v));
const pj = (s) => {
  if (s === null || s === undefined) return null;
  try { return JSON.parse(s); } catch { return s; }
};

// ---------- sessions ----------
export function createSession({ journey, lang, aiMode, userId }) {
  if (!userId) throw new Error('A signed-in user is required to create a session');
  const id = crypto.randomUUID();
  const t = now();
  getDb().prepare('INSERT INTO sessions (id, user_id, journey, lang, status, ai_mode, started_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, userId, journey, lang, 'active', aiMode, t, t);
  return id;
}

export function sessionOwnedBy(id, userId) {
  return Boolean(id && userId && getDb().prepare('SELECT 1 FROM sessions WHERE id = ? AND user_id = ?').get(id, userId));
}

export function touchSession(id, patch = {}) {
  const db = getDb();
  if (patch.status) db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run(patch.status, now(), id);
  else db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now(), id);
}

// ---------- messages ----------
export function logMessage(sessionId, { role, kind = 'text', text, lang }) {
  getDb().prepare('INSERT INTO messages (session_id, role, kind, text, lang, created_at) VALUES (?,?,?,?,?,?)')
    .run(sessionId, role, kind, maskSensitive(text) ?? null, lang ?? null, now());
}

// ---------- audit log ----------
const ACTOR = { voice: 'ai', chat: 'ai', document: 'ai', account: 'system', policy: 'system', memory: 'system', user: 'user' };
// PAN never goes into logs/evidence in clear
export const maskSensitive = (s) => (s == null ? s : String(s).replace(/\b([A-Z]{5})(\d{4})([A-Z])\b/gi, 'XXXXX$2X'));

// Compare two form states and record one event per field that changed (value or source).
export function logFieldChanges(sessionId, before = {}, after = {}, evidence = null) {
  const db = getDb();
  const insert = db.prepare(`INSERT INTO field_events (session_id, field, old_value, new_value, source, actor, confidence, evidence, created_at, doc_id, page)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const t = now();
  const rows = [];
  for (const [field, fv] of Object.entries(after)) {
    const prev = before[field];
    if (prev && prev.value === fv.value && prev.source === fv.source && prev.verified === fv.verified) continue;
    // values the system looked up (e.g. patient name from "papa" + the policy's member list)
    const ev = ['account', 'policy'].includes(fv.source) && evidence && !evidence.startsWith('Prefilled')
      ? 'Looked up on the linked policy from what the user said'
      : evidence;
    const note = fv.confirmedBy === 'user' ? 'User chose this value when sources disagreed' : fv.verified && prev?.value === fv.value ? `Confirmed by ${fv.confirmedBy || 'document'}` : ev;
    rows.push([sessionId, field, j(prev?.value ?? null), j(fv.value), fv.source, fv.confirmedBy === 'user' ? 'user' : ACTOR[fv.source] || 'system', fv.confidence ?? null, maskSensitive(note), t, fv.docId ?? null, fv.page ?? null]);
  }
  db.transaction((rs) => rs.forEach((r) => insert.run(...r)))(rows);
  return rows.length;
}

// ---------- documents ----------
export function logDocument(sessionId, { docId, docType, fileName, extracted, readBy, page }) {
  getDb().prepare('INSERT INTO documents (session_id, doc_type, file_name, extracted, read_by, created_at, doc_id, page) VALUES (?,?,?,?,?,?,?,?)')
    .run(sessionId, docType ?? null, fileName ?? null, j(extracted ?? {}), readBy, now(), docId ?? null, page ?? null);
}

// ---------- resumable state ----------
export function saveSessionState(id, state) {
  getDb().prepare('UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?').run(j(state), now(), id);
}

export function loadSession(id, userId) {
  if (!id || !userId) return null;
  const db = getDb();
  const s = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(id, userId);
  if (!s) return null;
  const messages = db.prepare('SELECT role, kind, text, lang, created_at FROM messages WHERE session_id = ? ORDER BY id').all(id);
  return { ...s, state: pj(s.state), messages };
}

// ---------- submissions ----------
export function saveSubmission(s) {
  if (!s.userId) throw new Error('A signed-in user is required to save a submission');
  const db = getDb();
  return db.transaction(() => {
    const updated = db.prepare(`UPDATE sessions SET status = 'submitted', updated_at = ?
                                WHERE id = ? AND user_id = ? AND status = 'active'`)
      .run(now(), s.sessionId, s.userId);
    if (updated.changes !== 1) return false;
    db.prepare(`INSERT INTO submissions (id, session_id, journey, status, headline, amount, amount_label, fields, computed, timeline, n8n_status, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(s.id, s.sessionId, s.journey, s.status, s.headline, s.amount ?? null, s.amountLabel ?? null, j(s.fields), j(s.computed), j(s.timeline), s.n8nStatus ?? null, now());
    db.prepare(`INSERT INTO messages (session_id, role, kind, text, lang, created_at) VALUES (?,?,?,?,?,?)`)
      .run(s.sessionId, 'user', 'text', maskSensitive(`Confirmed and submitted (${s.id})`), null, now());
    const memory = db.prepare(`INSERT INTO user_memory (user_id, key, value, source_session, updated_at) VALUES (?,?,?,?,?)
                               ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, source_session = excluded.source_session, updated_at = excluded.updated_at`);
    const t = now();
    for (const [key, value] of Object.entries(s.memoryFacts || {})) {
      if (value !== undefined && value !== null && value !== '') memory.run(s.userId, key, j(value), s.sessionId, t);
    }
    return true;
  })();
}

export function updateSubmissionN8n(id, n8nStatus) {
  getDb().prepare('UPDATE submissions SET n8n_status = ? WHERE id = ?').run(n8nStatus, id);
}

export function listSubmissions(userId, limit = 100) {
  if (!userId) return [];
  return getDb().prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM field_events e WHERE e.session_id = s.session_id AND e.actor = 'ai')   AS ai_events,
      (SELECT COUNT(*) FROM field_events e WHERE e.session_id = s.session_id AND e.actor = 'user') AS user_edits
    FROM submissions s
    JOIN sessions owner_session ON owner_session.id = s.session_id
    WHERE owner_session.user_id = ?
    ORDER BY s.created_at DESC LIMIT ?`).all(userId, limit)
    .map((r) => ({ ...r, fields: pj(r.fields), computed: pj(r.computed), timeline: pj(r.timeline) }));
}

export function getSubmissionDetail(id, userId) {
  if (!id || !userId) return null;
  const db = getDb();
  const sub = db.prepare(`SELECT s.* FROM submissions s
                          JOIN sessions owner_session ON owner_session.id = s.session_id
                          WHERE s.id = ? AND owner_session.user_id = ?`).get(id, userId);
  if (!sub) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sub.session_id);
  const events = db.prepare('SELECT * FROM field_events WHERE session_id = ? ORDER BY id').all(sub.session_id)
    .map((e) => ({ ...e, old_value: pj(e.old_value), new_value: pj(e.new_value) }));
  const messages = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id').all(sub.session_id);
  const documents = db.prepare('SELECT * FROM documents WHERE session_id = ? ORDER BY id').all(sub.session_id)
    .map((d) => ({ ...d, extracted: pj(d.extracted) }));
  return {
    submission: { ...sub, fields: pj(sub.fields), computed: pj(sub.computed), timeline: pj(sub.timeline) },
    session, events, messages, documents,
  };
}

export function stats(userId) {
  if (!userId) return { sessions: 0, submissions: 0, aiFields: 0, userEdits: 0, documents: 0 };
  const db = getDb();
  return {
    sessions: db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ?').get(userId).n,
    submissions: db.prepare('SELECT COUNT(*) n FROM submissions s JOIN sessions j ON j.id = s.session_id WHERE j.user_id = ?').get(userId).n,
    aiFields: db.prepare("SELECT COUNT(*) n FROM field_events e JOIN sessions j ON j.id = e.session_id WHERE j.user_id = ? AND e.actor = 'ai'").get(userId).n,
    userEdits: db.prepare("SELECT COUNT(*) n FROM field_events e JOIN sessions j ON j.id = e.session_id WHERE j.user_id = ? AND e.actor = 'user'").get(userId).n,
    documents: db.prepare('SELECT COUNT(*) n FROM documents d JOIN sessions j ON j.id = d.session_id WHERE j.user_id = ?').get(userId).n,
  };
}

// ---------- memory ----------
export function getMemoryFacts(userId) {
  if (!userId) return {};
  const rows = getDb().prepare('SELECT key, value FROM user_memory WHERE user_id = ?').all(userId);
  return Object.fromEntries(rows.map((r) => [r.key, pj(r.value)]));
}

export function upsertMemory(facts, sessionId, userId) {
  if (!userId) throw new Error('A signed-in user is required to save memory');
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO user_memory (user_id, key, value, source_session, updated_at) VALUES (?,?,?,?,?)
                           ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, source_session = excluded.source_session, updated_at = excluded.updated_at`);
  const t = now();
  db.transaction(() => {
    for (const [k, v] of Object.entries(facts)) {
      if (v !== undefined && v !== null && v !== '') stmt.run(userId, k, j(v), sessionId ?? null, t);
    }
  })();
}

export function clearMemory(userId) {
  if (!userId) throw new Error('A signed-in user is required to clear memory');
  getDb().prepare('DELETE FROM user_memory WHERE user_id = ?').run(userId);
}

// Wipes only the signed-in user's journeys — used by "Reset demo data".
export function clearAll(userId) {
  if (!userId) throw new Error('A signed-in user is required to clear journey data');
  const db = getDb();
  db.transaction(() => {
    const owned = 'SELECT id FROM sessions WHERE user_id = ?';
    const bySession = (table) => db.prepare(`DELETE FROM ${table} WHERE session_id IN (${owned})`).run(userId);
    for (const table of ['field_events', 'messages', 'documents', 'submissions']) bySession(table);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_memory WHERE user_id = ?').run(userId);
  })();
}
