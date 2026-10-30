'use client';
// Browser-side helpers: speaking replies, shrinking photos before upload.

let currentAudio = null;
// Every speak request gets a number. A request that finishes downloading after a newer one
// started is thrown away — this is what stops two replies playing over each other (the "echo").
let speakSeq = 0;

export function stopSpeaking() {
  speakSeq += 1;
  try { currentAudio?.pause(); } catch {}
  currentAudio = null;
  try { window.speechSynthesis?.cancel(); } catch {}
}

function browserSpeak(text, lang) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang === u.lang);
    if (voice) u.voice = voice;
    u.onend = resolve;
    u.onerror = resolve;
    window.speechSynthesis.speak(u);
  });
}

// Uses Sarvam (via /api/tts) when available, otherwise the browser's built-in voice.
export async function speakText(text, lang, useSarvam) {
  stopSpeaking();
  const mine = speakSeq;
  if (useSarvam) {
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) });
      if (mine !== speakSeq) return; // a newer reply (or the mic) took over while this was loading
      if (res.ok) {
        const { audio, mime } = await res.json();
        if (mine !== speakSeq) return;
        const el = new Audio(`data:${mime};base64,${audio}`);
        currentAudio = el;
        await new Promise((resolve) => {
          el.onended = resolve;
          el.onerror = resolve;
          el.play().catch(resolve);
        });
        return;
      }
    } catch {}
  }
  if (mine !== speakSeq) return;
  await browserSpeak(text, lang);
}// Sarvam only accepts WAV/MP3/AAC uploads, but Chrome records WebM.
// Decode the recording and re-encode it as 16 kHz mono 16-bit WAV.
export async function blobToWav16k(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const pcm = (await offline.startRendering()).getChannelData(0);
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function isSecureForMic() {
  return typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

export function fileToDataUrl(file, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(reader.result);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
