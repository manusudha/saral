import { NextResponse } from 'next/server';
import { sessionExists, logFieldChanges, touchSession, saveSessionState } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Records a manual edit made on the review screen (audit log: actor = user) and saves the state for resume
export async function POST(req) {
  const { sessionId, field, before, after, state } = await req.json();
  if (!sessionExists(sessionId)) return NextResponse.json({ ok: false, error: 'unknown session' }, { status: 404 });
  logFieldChanges(sessionId, before ? { [field]: before } : {}, { [field]: after }, 'Edited by the user on the review screen');
  if (state?.fields) saveSessionState(sessionId, state);
  touchSession(sessionId);
  return NextResponse.json({ ok: true });
}
