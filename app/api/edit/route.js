import { NextResponse } from 'next/server';
import { loadSession, logFieldChanges, touchSession, saveSessionState } from '@/lib/db';
import { getSignedInUser } from '@/lib/clerkUser';
import { derive } from '@/lib/rules';
import { SCHEMAS, fieldDef } from '@/lib/schemas';
import { illustrativePolicyContext } from '@/lib/illustrativePolicy';
import { profileFactsFromFields, rememberProfileFromFields } from '@/lib/memory';
import { createMemoryToken, createSessionToken, readMemoryToken, readSessionToken, statelessSessionsEnabled } from '@/lib/statelessSession';

export const dynamic = 'force-dynamic';

// Records a manual edit made on the review screen (audit log: actor = user) and saves the state for resume
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: 'Bad request' }, { status: 400 });
  }
  const user = await getSignedInUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const stateless = statelessSessionsEnabled();
  const session = stateless ? readSessionToken(body.sessionToken, user.id) : loadSession(body.sessionId, user.id);
  if (session && body.sessionId && session.id !== body.sessionId) {
    return NextResponse.json({ ok: false, error: 'Unknown session' }, { status: 404 });
  }
  if (!session || session.status !== 'active' || !session.state?.fields) {
    return NextResponse.json({ ok: false, error: 'Unknown session' }, { status: 404 });
  }
  const schema = SCHEMAS[session.journey];
  if (!schema || typeof body.field !== 'string' || !fieldDef(schema, body.field)) {
    return NextResponse.json({ ok: false, error: 'Unknown field' }, { status: 400 });
  }
  const value = body.after?.value;
  if (!body.after || typeof body.after !== 'object'
    || !Object.prototype.hasOwnProperty.call(body.after, 'value')
    || (value !== null && !['string', 'number'].includes(typeof value))) {
    return NextResponse.json({ ok: false, error: 'Invalid field value' }, { status: 400 });
  }

  const previous = session.state.fields;
  const field = body.field;
  const fields = derive(session.journey, {
    ...previous,
    [field]: { value, source: 'user', confidence: 1, verified: true },
  }, illustrativePolicyContext);
  if (!stateless) {
    logFieldChanges(session.id, { [field]: previous[field] }, { [field]: fields[field] }, 'Edited by the user on the review screen');
    saveSessionState(session.id, { ...session.state, fields });
    rememberProfileFromFields(fields, session.id, user.id);
    touchSession(session.id);
    return NextResponse.json({ ok: true });
  }
  const state = { ...session.state, fields };
  const memoryFacts = { ...readMemoryToken(body.memoryToken, user.id), ...profileFactsFromFields(fields) };
  try {
    return NextResponse.json({
      ok: true,
      sessionToken: createSessionToken({ id: session.id, userId: user.id, journey: session.journey, state, messages: session.messages }),
      memoryToken: createMemoryToken(user.id, memoryFacts),
    });
  } catch (e) {
    console.error('[saral] could not update encrypted session', e.message);
    const tooLarge = e.message.includes('too large');
    return NextResponse.json({ ok: false, error: tooLarge ? 'This journey has reached its storage limit. Remove some details and try again.' : 'Could not save this edit securely.' }, { status: tooLarge ? 413 : 500 });
  }
}
