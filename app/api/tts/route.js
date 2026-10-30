import { NextResponse } from 'next/server';
import { sarvamEnabled, speak } from '@/lib/sarvam';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  if (!sarvamEnabled()) return NextResponse.json({ error: 'SARVAM_API_KEY not set' }, { status: 501 });
  try {
    const { text, lang } = await req.json();
    const audio = await speak(text, lang);
    return NextResponse.json({ audio, mime: 'audio/wav' });
  } catch (e) {
    console.error('[saral] tts error', e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
