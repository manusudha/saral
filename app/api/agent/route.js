import { NextResponse } from 'next/server';
import { runAgent } from '@/lib/agent';
import { sessionExists, logMessage, logDocument, logFieldChanges, touchSession } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  try {
    const body = await req.json();
    const result = await runAgent(body);

    // Record the turn: what the user sent, what the AI read, which fields changed, what Saral replied
    try {
      const sid = body.sessionId;
      if (sessionExists(sid)) {
        if (body.image) {
          logMessage(sid, { role: 'user', kind: 'doc', text: body.fileName || 'photo' });
          if (result.docRecord) logDocument(sid, result.docRecord);
        } else if (body.text) {
          logMessage(sid, { role: 'user', kind: body.mode === 'voice' ? 'voice' : 'text', text: body.text, lang: result.lang });
        }
        const evidence = body.image
          ? `Photo: ${body.fileName || 'document'} (${result.docRecord?.docType || 'unknown'}, read by ${result.docRecord?.readBy})`
          : `${body.mode === 'voice' ? 'Said' : 'Typed'}: "${String(body.text || '').slice(0, 300)}"`;
        logFieldChanges(sid, body.fields || {}, result.fields, evidence);
        logMessage(sid, { role: 'saral', kind: 'text', text: result.reply, lang: result.lang });
        touchSession(sid);
      }
    } catch (e) {
      console.error('[saral] db error on agent turn', e);
    }

    const { docRecord, ...publicResult } = result;
    return NextResponse.json(publicResult);
  } catch (e) {
    console.error('[saral] agent error', e);
    return NextResponse.json({ error: e.message || 'agent failed' }, { status: 500 });
  }
}
