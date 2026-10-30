import { NextResponse } from 'next/server';
import { sarvamEnabled, transcribe } from '@/lib/sarvam';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!sarvamEnabled()) return NextResponse.json({ error: 'SARVAM_API_KEY not set' }, { status: 501 });
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file) return NextResponse.json({ error: 'no audio' }, { status: 400 });
    const out = await transcribe(file);
    return NextResponse.json(out);
  } catch (e) {
    console.error('[saral] stt error', e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
