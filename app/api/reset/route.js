import { NextResponse } from 'next/server';
import { resetMemory } from '@/lib/memory';
import { clearAll } from '@/lib/db';

export const dynamic = 'force-dynamic';

// { scope: 'memory' } clears remembered facts (between rehearsals)
// { scope: 'all' }    also deletes every session, submission and audit row
export async function POST(req) {
  const { scope = 'memory' } = await req.json().catch(() => ({}));
  if (scope === 'all') clearAll();
  else resetMemory();
  return NextResponse.json({ ok: true, scope });
}
