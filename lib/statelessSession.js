import crypto from 'crypto';

const TOKEN_VERSION = 1;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MEMORY_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_TOKEN_BYTES = 96 * 1024;

export function statelessSessionsEnabled() {
  return process.env.VERCEL === '1' || process.env.STATELESS_SESSIONS === '1';
}

function encryptionKey() {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('CLERK_SECRET_KEY is required for encrypted stateless sessions');
  return crypto.createHash('sha256').update(secret).digest();
}

function seal(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const token = `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  if (Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES) throw new Error('Session data is too large to continue without a database');
  return token;
}

function open(token, userId, purpose) {
  if (typeof token !== 'string' || Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES || !userId) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const payload = JSON.parse(plaintext);
    if (payload.version !== TOKEN_VERSION || payload.purpose !== purpose || payload.userId !== userId || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken({ id, userId, journey, state, messages = [], status = 'active' }) {
  if (!id || !userId || !journey || !state?.fields) throw new Error('Invalid session state');
  return seal({
    version: TOKEN_VERSION,
    purpose: 'session',
    id,
    userId,
    journey,
    status,
    state,
    messages: messages.slice(-20),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
}

export function readSessionToken(token, userId) {
  const payload = open(token, userId, 'session');
  if (!payload || !payload.id || !payload.journey || !payload.state?.fields || !['active', 'submitted'].includes(payload.status)) return null;
  return payload;
}

export function createMemoryToken(userId, facts) {
  if (!userId || !facts || typeof facts !== 'object' || Array.isArray(facts)) throw new Error('Invalid user memory');
  return seal({
    version: TOKEN_VERSION,
    purpose: 'memory',
    userId,
    facts,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
}

export function readMemoryToken(token, userId) {
  const payload = open(token, userId, 'memory');
  return payload?.facts && typeof payload.facts === 'object' && !Array.isArray(payload.facts) ? payload.facts : {};
}
