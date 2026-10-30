import { NextResponse } from 'next/server';
import { sessionExists, logFieldChanges, touchSession } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Records a manual edit made on the review screen (audit log: actor = user)
export async function POST(req) {
  const { sessionId, field, before, after } = await req.json();
  if (!sessionExists(sessionId)) return NextResponse.json({ ok: false, error: 'unknown session' }, { status: 404 });
  logFieldChanges(sessionId, before ? { [field]: before } : {}, { [field]: after }, 'Edited on the review screen');
  touchSession(sessionId);
  return NextResponse.json({ ok: true });
}
