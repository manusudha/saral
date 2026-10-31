import { NextResponse } from 'next/server';
import { runAgent, maskPan } from '@/lib/agent';
import { sessionExists, logMessage, logDocument, logFieldChanges, touchSession, saveSessionState } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  try {
    const result = await runAgent(body);

    // Record the turn: what the user sent, what was read, which fields changed, what Saral replied
    try {
      const sid = body.sessionId;
      if (sessionExists(sid)) {
        if (body.file) {
          logMessage(sid, { role: 'user', kind: 'doc', text: body.file.name || 'document' });
          if (result.docRecord) logDocument(sid, result.docRecord);
        } else if (Number.isInteger(body.choice) && body.pending) {
          logMessage(sid, { role: 'user', kind: 'text', text: `Chose: ${body.pending.options?.[body.choice]?.label} for ${body.pending.label}` });
        } else if (body.text) {
          logMessage(sid, { role: 'user', kind: body.mode === 'voice' ? 'voice' : 'text', text: body.text, lang: result.lang });
        }
        const evidence = body.file
          ? `Document: ${body.file.name || 'file'} (${result.docRecord?.docType || 'unknown'}, read by ${result.docRecord?.readBy})`
          : Number.isInteger(body.choice) ? 'User picked between conflicting sources'
            : `${body.mode === 'voice' ? 'Said' : 'Typed'}: "${maskPan(String(body.text || '').slice(0, 300))}"`;
        logFieldChanges(sid, body.fields || {}, result.fields, evidence);
        logMessage(sid, { role: 'saral', kind: 'text', text: result.reply, lang: result.lang });
        saveSessionState(sid, { fields: result.fields, docs: result.docs, pending: result.pending, lang: result.lang });
        touchSession(sid);
      }
    } catch (e) {
      console.error('[saral] db error on agent turn', e.message);
    }

    const { docRecord, ...publicResult } = result;
    return NextResponse.json(publicResult);
  } catch (e) {
    console.error('[saral] agent error', e.message);
    return NextResponse.json({ error: 'Saral couldn’t process that. Please try again.' }, { status: 500 });
  }
}
