import { NextResponse } from 'next/server';
import { resetMemory } from '@/lib/memory';
import { clearAll } from '@/lib/db';
import { getSignedInUser } from '@/lib/clerkUser';

export const dynamic = 'force-dynamic';

// { scope: 'memory' } clears remembered facts (between rehearsals)
// { scope: 'all' }    also deletes every session, submission and audit row
export async function POST(req) {
  let body = {};
  if (req.headers.get('content-type')?.includes('application/json')) {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const user = await getSignedInUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const scope = body.scope || 'memory';
  if (scope !== 'memory' && scope !== 'all') {
    return NextResponse.json({ error: 'Unknown reset scope' }, { status: 400 });
  }
  if (scope === 'all') clearAll(user.id);
  else resetMemory(user.id);
  return NextResponse.json({ ok: true, scope });
}
