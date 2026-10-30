// Sarvam AI: speech-to-text and text-to-speech. Docs: https://docs.sarvam.ai
const BASE = 'https://api.sarvam.ai';

export function sarvamEnabled() {
  return Boolean(process.env.SARVAM_API_KEY);
}

export async function transcribe(file) {
  const form = new FormData();
  form.append('file', file, file.name || 'speech.webm');
  form.append('language_code', 'unknown'); // auto-detect Hindi / English / other Indian languages
  if (process.env.SARVAM_STT_MODEL) form.append('model', process.env.SARVAM_STT_MODEL);
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'api-subscription-key': process.env.SARVAM_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error(`Sarvam STT ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return { transcript: data.transcript || '', languageCode: data.language_code || null };
}

export async function speak(text, lang) {
  const languageCode = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const body = {
    text: text.slice(0, 1400),
    language_code: languageCode,
    target_language_code: languageCode, // older API versions use this name
    model: process.env.SARVAM_TTS_MODEL || 'bulbul:v3',
    speaker: process.env.SARVAM_TTS_SPEAKER || 'priya',
  };
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: 'POST',
    headers: { 'api-subscription-key': process.env.SARVAM_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sarvam TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const audio = data?.audios?.[0];
  if (!audio) throw new Error('Sarvam TTS returned no audio');
  return audio; // base64 WAV
}
