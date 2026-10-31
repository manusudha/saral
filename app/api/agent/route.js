import { NextResponse } from 'next/server';
import { runAgent, maskPan } from '@/lib/agent';
import { loadSession, logMessage, logDocument, logFieldChanges, touchSession, saveSessionState } from '@/lib/db';
import { getSignedInUser } from '@/lib/clerkUser';
import { profileFactsFromFields, rememberProfileFromFields } from '@/lib/memory';
import { createMemoryToken, createSessionToken, readMemoryToken, readSessionToken, statelessSessionsEnabled } from '@/lib/statelessSession';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  try {
    const user = await getSignedInUser();
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    const stateless = statelessSessionsEnabled();
    const session = stateless ? readSessionToken(body.sessionToken, user.id) : loadSession(body.sessionId, user.id);
    if (session && body.sessionId && session.id !== body.sessionId) {
      return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
    }
    if (!session || session.status !== 'active' || !session.state?.fields) {
      return NextResponse.json({ error: 'Unknown session' }, { status: 404 });
    }

    const turn = {
      ...body,
      sessionId: session.id,
      journey: session.journey,
      fields: session.state.fields,
      docs: session.state.docs || {},
      pending: session.state.pending || null,
      messages: stateless ? session.messages : body.messages,
    };
    const result = await runAgent(turn);

    // Record the turn: what the user sent, what was read, which fields changed, what Saral replied
    const sid = session.id;
    let userMessage;
    if (body.file) {
      userMessage = { role: 'user', kind: 'doc', text: body.file.name || 'document' };
      if (!stateless && result.docRecord) logDocument(sid, result.docRecord);
    } else if (Number.isInteger(body.choice) && turn.pending) {
      userMessage = { role: 'user', kind: 'text', text: `Chose: ${turn.pending.options?.[body.choice]?.label} for ${turn.pending.label}` };
    } else if (body.text) {
      userMessage = { role: 'user', kind: body.mode === 'voice' ? 'voice' : 'text', text: maskPan(String(body.text).slice(0, 300)), lang: result.lang };
    }
    if (!stateless) {
      if (userMessage) logMessage(sid, userMessage);
      const evidence = body.file
        ? `Document: ${body.file.name || 'file'} (${result.docRecord?.docType || 'unknown'}, read by ${result.docRecord?.readBy})`
        : Number.isInteger(body.choice) ? 'User picked between conflicting sources'
          : `${body.mode === 'voice' ? 'Said' : 'Typed'}: "${maskPan(String(body.text || '').slice(0, 300))}"`;
      logFieldChanges(sid, turn.fields, result.fields, evidence);
      logMessage(sid, { role: 'saral', kind: 'text', text: result.reply, lang: result.lang });
      saveSessionState(sid, { fields: result.fields, docs: result.docs, pending: result.pending, lang: result.lang });
      rememberProfileFromFields(result.fields, sid, user.id);
      touchSession(sid);
    }

    const { docRecord, ...publicResult } = result;
    if (!stateless) return NextResponse.json(publicResult);
    const state = { fields: result.fields, docs: result.docs, pending: result.pending, lang: result.lang };
    const messages = [...session.messages, ...(userMessage ? [userMessage] : []), { role: 'saral', kind: 'text', text: result.reply, lang: result.lang }].slice(-20);
    const memoryFacts = { ...readMemoryToken(body.memoryToken, user.id), ...profileFactsFromFields(result.fields) };
    return NextResponse.json({
      ...publicResult,
      sessionToken: createSessionToken({ id: session.id, userId: user.id, journey: session.journey, state, messages }),
      memoryToken: createMemoryToken(user.id, memoryFacts),
    });
  } catch (e) {
    console.error('[saral] agent error', e.message);
    return NextResponse.json({ error: 'Saral couldn’t process that. Please try again.' }, { status: 500 });
  }
}
