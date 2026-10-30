import { NextResponse } from 'next/server';
import { SCHEMAS } from '@/lib/schemas';
import { prefillFor } from '@/lib/memory';
import { evaluate } from '@/lib/rules';
import { greeting } from '@/lib/replies';
import { llmEnabled } from '@/lib/llm';
import { sarvamEnabled } from '@/lib/sarvam';
import { createSession, logFieldChanges, logMessage } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { journey, lang = 'hi' } = await req.json();
  if (!SCHEMAS[journey]) return NextResponse.json({ error: 'unknown journey' }, { status: 400 });
  const fields = prefillFor(journey);
  const memorySources = Object.entries(fields).filter(([, v]) => v.source === 'memory').map(([k]) => k);
  const status = evaluate(journey, fields, {});
  const reply = greeting(journey, lang, Object.keys(fields), memorySources);

  let sessionId = null;
  try {
    sessionId = createSession({ journey, lang, aiMode: llmEnabled() ? 'live' : 'offline' });
    logFieldChanges(sessionId, {}, fields, 'Prefilled from Paytm account / earlier journeys');
    logMessage(sessionId, { role: 'saral', kind: 'text', text: reply, lang });
  } catch (e) {
    console.error('[saral] db error on start', e);
  }

  return NextResponse.json({
    sessionId,
    schema: SCHEMAS[journey],
    fields,
    docs: {},
    status,
    reply,
    capabilities: { ai: llmEnabled(), stt: sarvamEnabled(), tts: sarvamEnabled() },
  });
}
