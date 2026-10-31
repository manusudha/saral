import { NextResponse } from 'next/server';
import { loadSession, logFieldChanges, touchSession, saveSessionState } from '@/lib/db';
import { getSignedInUser } from '@/lib/clerkUser';
import { derive } from '@/lib/rules';
import { SCHEMAS, fieldDef } from '@/lib/schemas';
import { illustrativePolicyContext } from '@/lib/illustrativePolicy';
import { rememberProfileFromFields } from '@/lib/memory';

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
  const session = loadSession(body.sessionId, user.id);
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
  logFieldChanges(session.id, { [field]: previous[field] }, { [field]: fields[field] }, 'Edited by the user on the review screen');
  saveSessionState(session.id, { ...session.state, fields });
  rememberProfileFromFields(fields, session.id, user.id);
  touchSession(session.id);
  return NextResponse.json({ ok: true });
}
