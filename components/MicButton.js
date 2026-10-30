'use client';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sendTurn, setBusy, setError } from '@/store/journeySlice';
import { stopSpeaking, isSecureForMic, blobToWav16k } from '@/lib/clientMedia';

// Turns a getUserMedia failure into a message that says what is actually wrong and how to fix it.
function micErrorMessage(e) {
  const name = e?.name || '';
  const msg = (e?.message || '').toLowerCase();
  if (!isSecureForMic()) {
    return 'The mic only works on http://localhost:3000 or an https address. You opened the app from another address — open it on localhost, or use an https link.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    if (msg.includes('system')) {
      return 'Your computer is blocking Chrome from the mic. Windows: Settings → Privacy & security → Microphone → turn on "Let desktop apps access your microphone". Mac: System Settings → Privacy & Security → Microphone → turn on Google Chrome, then restart Chrome.';
    }
    return 'Chrome has blocked the mic for this page. Click the icon left of the address bar → Site settings → Microphone → Allow, then reload the page.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone found. Plug in a mic or headset and try again.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'The mic is being used by another app (Zoom, Meet, Teams…) or the system blocked it. Close the other app and try again.';
  }
  return `Couldn’t start the mic (${name || 'error'}: ${e?.message || 'unknown'}). You can type instead.`;
}

// Voice input. Uses Sarvam speech-to-text when the server has a key,
// otherwise the browser's own speech recognition (Chrome), otherwise it is disabled.
export default function MicButton({ size = 'lg' }) {
  const dispatch = useDispatch();
  const { capabilities, lang, busy } = useSelector((s) => s.journey);
  const [recording, setRecording] = useState(false);
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const browserRecRef = useRef(null);
  const [browserSR, setBrowserSR] = useState(false);

  useEffect(() => {
    setBrowserSR(typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => {
      // release the mic if the user leaves the page mid-recording
      try { recRef.current?.state !== 'inactive' && recRef.current?.stop(); } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try { browserRecRef.current?.abort(); } catch {}
    };
  }, []);

  const mode = capabilities.stt ? 'sarvam' : browserSR ? 'browser' : 'none';
  const disabled = mode === 'none' || (busy && busy !== 'listening');

  async function startSarvam() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      console.error('[saral] getUserMedia failed', e);
      dispatch(setError(micErrorMessage(e)));
      return;
    }
    let rec;
    try {
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => window.MediaRecorder?.isTypeSupported?.(m));
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      console.error('[saral] MediaRecorder failed', e);
      dispatch(setError('This browser can’t record audio. Please use Chrome or Edge, or type instead.'));
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const type = rec.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      if (blob.size < 2000) {
        dispatch(setBusy(null));
        dispatch(setError('That was too short — hold the mic a little longer while you speak.'));
        return;
      }
      dispatch(setBusy('transcribing'));
      try {
        const wav = await blobToWav16k(blob);
        const fd = new FormData();
        fd.append('file', new File([wav], 'speech.wav', { type: 'audio/wav' }));
        const res = await fetch('/api/stt', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not transcribe');
        dispatch(setBusy(null));
        if (data.transcript?.trim()) dispatch(sendTurn({ text: data.transcript.trim(), mode: 'voice' }));
        else dispatch(setError('Didn’t catch that — please try again or type.'));
      } catch (e) {
        dispatch(setBusy(null));
        dispatch(setError(`Voice to text failed: ${e.message}. You can type instead.`));
      }
    };
    rec.start();
    recRef.current = rec;
    setRecording(true);
    dispatch(setBusy('listening'));
  }

  function startBrowser() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript;
      if (text) dispatch(sendTurn({ text, mode: 'voice' }));
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') dispatch(setError(micErrorMessage({ name: 'NotAllowedError', message: '' })));
      else if (e.error === 'network') dispatch(setError('Chrome’s built-in speech recognition needs internet. Check the connection, or add a Sarvam key.'));
      else dispatch(setError(`Voice error: ${e.error}`));
    };
    r.onend = () => { setRecording(false); dispatch(setBusy(null)); browserRecRef.current = null; };
    browserRecRef.current = r;
    try {
      r.start();
      setRecording(true);
      dispatch(setBusy('listening'));
    } catch (e) {
      dispatch(setError(micErrorMessage(e)));
    }
  }

  function toggle() {
    stopSpeaking(); // never record Saral's own voice
    dispatch(setError(null));
    if (recording) {
      setRecording(false);
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
      if (browserRecRef.current) browserRecRef.current.stop();
      return;
    }
    if (mode === 'sarvam') {
      if (!isSecureForMic()) { dispatch(setError(micErrorMessage({}))); return; }
      startSarvam();
    } else if (mode === 'browser') startBrowser();
  }

  const dim = size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={mode === 'none' ? 'Voice isn’t available in this browser — type instead' : recording ? 'Stop and send' : 'Speak'}
      className={`grid shrink-0 place-items-center rounded-full text-white transition focus:outline-none focus-visible:ring-4 focus-visible:ring-sky/40 ${dim} ${
        recording ? 'animate-pulsering bg-red-500' : 'bg-sky hover:bg-navy'
      } disabled:cursor-not-allowed disabled:bg-slate-300`}
      aria-label={recording ? 'Stop recording and send' : 'Speak'}
    >
      {recording ? (
        <span className="h-4 w-4 rounded-sm bg-white" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
        </svg>
      )}
    </button>
  );
}
