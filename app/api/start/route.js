import { NextResponse } from 'next/server';
import { SCHEMAS } from '@/lib/schemas';
import { prefillFor, profileFactsFromFields } from '@/lib/memory';
import { evaluate, derive } from '@/lib/rules';
import { greeting } from '@/lib/replies';
import { llmEnabled } from '@/lib/llm';
import { sarvamEnabled } from '@/lib/sarvam';
import { createSession, logFieldChanges, logMessage, loadSession, saveSessionState } from '@/lib/db';
import { getSignedInUser } from '@/lib/clerkUser';
import { illustrativePolicyContext } from '@/lib/illustrativePolicy';
import crypto from 'crypto';
import { createMemoryToken, createSessionToken, readMemoryToken, readSessionToken, statelessSessionsEnabled } from '@/lib/statelessSession';

export const dynamic = 'force-dynamic';

const capabilities = () => ({ ai: llmEnabled(), stt: sarvamEnabled(), tts: sarvamEnabled() });

export async function POST(req) {
  const user = await getSignedInUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { journey, lang = 'hi', resumeSessionId, sessionToken, memoryToken } = await req.json();
  if (!SCHEMAS[journey]) return NextResponse.json({ error: 'unknown journey' }, { status: 400 });
  const stateless = statelessSessionsEnabled();

  // Resume an unfinished application (after a refresh)
  if (stateless) {
    if (sessionToken) {
      const s = readSessionToken(sessionToken, user.id);
      if (s && s.journey === journey && s.status === 'active' && s.state?.fields) {
        const status = evaluate(journey, s.state.fields, s.state.docs || {}, { policy: illustrativePolicyContext });
        if (s.state.pending) { status.complete = false; status.next = { kind: 'conflict', key: s.state.pending.field }; }
        let resumedMemory;
        try {
          resumedMemory = createMemoryToken(user.id, {
            ...readMemoryToken(memoryToken, user.id),
            ...profileFactsFromFields(s.state.fields),
          });
        } catch (e) {
          console.error('[saral] could not refresh encrypted user memory', e.message);
          return NextResponse.json({ error: 'Could not restore this journey securely. Please try again.' }, { status: 500 });
        }
        return NextResponse.json({
          sessionId: s.id, sessionToken, memoryToken: resumedMemory, resumed: true, schema: SCHEMAS[journey], fields: s.state.fields, docs: s.state.docs || {}, pending: s.state.pending || null,
          status, messages: s.messages, lang: s.state.lang || lang, capabilities: capabilities(),
        });
      }
    }
  } else if (resumeSessionId) {
    try {
      const s = loadSession(resumeSessionId, user.id);
      if (s && s.journey === journey && s.status === 'active' && s.state?.fields) {
        const status = evaluate(journey, s.state.fields, s.state.docs || {}, { policy: illustrativePolicyContext });
        if (s.state.pending) { status.complete = false; status.next = { kind: 'conflict', key: s.state.pending.field }; }
        return NextResponse.json({
          sessionId: s.id, resumed: true, schema: SCHEMAS[journey], fields: s.state.fields, docs: s.state.docs || {}, pending: s.state.pending || null,
          status, messages: s.messages, lang: s.state.lang || lang, capabilities: capabilities(),
        });
      }
    } catch (e) {
      console.error('[saral] resume failed', e);
    }
  }

  const storedMemory = stateless ? readMemoryToken(memoryToken, user.id) : undefined;
  const fields = derive(journey, prefillFor(journey, user, storedMemory), illustrativePolicyContext);
  const memorySources = Object.entries(fields).filter(([, v]) => v.source === 'memory').map(([k]) => k);
  const status = evaluate(journey, fields, {}, { policy: illustrativePolicyContext });
  const reply = greeting(journey, lang, memorySources, user.fullName);

  let sessionId;
  let token;
  let nextMemoryToken = memoryToken || null;
  if (stateless) {
    sessionId = crypto.randomUUID();
    const state = { fields, docs: {}, pending: null, lang };
    try {
      token = createSessionToken({ id: sessionId, userId: user.id, journey, state, messages: [{ role: 'saral', kind: 'text', text: reply, lang }] });
      nextMemoryToken = createMemoryToken(user.id, storedMemory);
    } catch (e) {
      console.error('[saral] could not create encrypted session', e.message);
      return NextResponse.json({ error: 'Could not start this journey securely. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ sessionId, sessionToken: token, memoryToken: nextMemoryToken, schema: SCHEMAS[journey], fields, docs: {}, pending: null, status, reply, capabilities: capabilities() });
  }

  try {
    sessionId = createSession({ journey, lang, aiMode: llmEnabled() ? 'live' : 'offline', userId: user.id });
    logFieldChanges(sessionId, {}, fields, 'Prefilled from your Clerk account / your earlier journeys');
    logMessage(sessionId, { role: 'saral', kind: 'text', text: reply, lang });
    saveSessionState(sessionId, { fields, docs: {}, pending: null, lang });
  } catch (e) {
    console.error('[saral] db error on start', e.message);
    return NextResponse.json({ error: 'Could not start this journey. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ sessionId, schema: SCHEMAS[journey], fields, docs: {}, pending: null, status, reply, capabilities: capabilities() });
}
