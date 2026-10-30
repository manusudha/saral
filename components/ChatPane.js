'use client';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sendTurn, uploadDoc, setError } from '@/store/journeySlice';
import { fileToDataUrl, speakText, stopSpeaking } from '@/lib/clientMedia';
import MicButton from './MicButton';

const BUSY_LABEL = {
  thinking: 'Thinking…',
  reading: 'Reading your document…',
  listening: 'Listening — tap the red button when you’re done',
  transcribing: 'Understanding what you said…',
  submitting: 'Submitting…',
};

const DOC_LABEL = { hospitalBill: 'hospital bill', dischargeSummary: 'discharge summary' };
const SAMPLE_FILE = { hospitalBill: '/samples/hospital-bill.jpg', dischargeSummary: '/samples/discharge-summary.jpg' };

// Example lines shown as tappable chips, keyed by what Saral is asking for next
const SUGGEST = {
  health_claim: {
    relationship: ['Mere papa dengue se hospital mein admit the, 42 hazar ka bill aaya', 'My father was admitted for dengue, the bill was ₹42,000'],
    patientName: ['Suresh Sharma'],
    upiId: ['amit.sharma@paytm'],
  },
  loan_precheck: {
    loanAmount: ['Mujhe shaadi ke liye 1.5 lakh ka loan chahiye', 'I need a loan of 1.5 lakh for a wedding'],
    employmentType: ['Main naukri karta hoon, salary 45 hazar hai, koi EMI nahi'],
    monthlyIncome: ['Salary 45 hazar hai'],
    existingEmi: ['Koi EMI nahi'],
    tenureMonths: ['24 mahine'],
    pan: ['ABCDE1234F'],
  },
};

export default function ChatPane() {
  const dispatch = useDispatch();
  const { messages, busy, status, journey, lang, capabilities, error, stage } = useSelector((s) => s.journey);
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy, error]);

  const next = status?.next;
  const suggestions = next?.kind === 'field' ? SUGGEST[journey]?.[next.key] || [] : [];

  function send(t) {
    const v = (t ?? text).trim();
    if (!v || busy) return;
    stopSpeaking();
    dispatch(sendTurn({ text: v, mode: 'chat' }));
    setText('');
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopSpeaking();
    try {
      const dataUrl = await fileToDataUrl(file);
      dispatch(uploadDoc({ dataUrl, fileName: file.name }));
    } catch {
      dispatch(setError('That file couldn’t be opened. Send a JPG or PNG photo.'));
    }
  }

  async function sendSample(key) {
    stopSpeaking();
    const res = await fetch(SAMPLE_FILE[key]);
    const blob = await res.blob();
    const file = new File([blob], SAMPLE_FILE[key].split('/').pop(), { type: blob.type });
    const dataUrl = await fileToDataUrl(file);
    dispatch(uploadDoc({ dataUrl, fileName: file.name }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* who you're talking to */}
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-lg font-extrabold text-white">स</div>
        <div className="min-w-0 flex-1">
          <div className="font-bold leading-tight text-ink">Saral</div>
          <div className={`truncate text-xs ${busy ? 'text-sky' : 'text-mute'}`} aria-live="polite">
            {busy ? BUSY_LABEL[busy] : 'Speak or type in Hindi or English'}
          </div>
        </div>
      </div>

      {/* conversation */}
      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas px-4 py-5 sm:px-5">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.kind === 'doc' ? (
              <div className="w-56 overflow-hidden rounded-2xl rounded-br-md border border-line bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.imageUrl} alt={m.text} className="h-40 w-full object-cover object-top" />
                <div className="truncate px-3 py-1.5 text-xs text-mute">📄 {m.text}</div>
              </div>
            ) : (
              <div
                className={`group max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                  m.role === 'user' ? 'rounded-br-md bg-navy text-white' : 'rounded-bl-md border border-line bg-white text-ink'
                }`}
              >
                {m.kind === 'voice' && <span className="mr-1 opacity-70" aria-label="spoken">🎤</span>}
                {m.text}
                {m.role === 'saral' && (
                  <button
                    onClick={() => speakText(m.text, m.lang || lang, capabilities.tts)}
                    className="ml-2 rounded align-middle text-xs text-mute opacity-60 hover:text-navy hover:opacity-100 focus-visible:opacity-100"
                    aria-label="Play this message"
                    title="Play"
                  >
                    🔊
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && busy !== 'listening' && (
          <div className="flex justify-start">
            <div className="dots rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 text-xl leading-none text-mute">
              <span>•</span><span>•</span><span>•</span>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}
      </div>

      {/* quick actions */}
      {stage === 'chat' && !busy && (next?.kind === 'doc' || suggestions.length > 0) && (
        <div className="flex flex-wrap gap-2 border-t border-line px-4 pt-3 sm:px-5">
          {next?.kind === 'doc' && (
            <>
              <button onClick={() => fileRef.current?.click()} className="rounded-full bg-sky px-3.5 py-2 text-sm font-semibold text-white hover:bg-navy">
                📷 Upload {DOC_LABEL[next.key]}
              </button>
              <button onClick={() => sendSample(next.key)} className="rounded-full border border-line px-3.5 py-2 text-sm font-medium text-mute hover:border-sky hover:text-navy">
                Use sample {DOC_LABEL[next.key]}
              </button>
            </>
          )}
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="max-w-full truncate rounded-full border border-sky/40 bg-sky-50 px-3.5 py-2 text-left text-sm text-navy hover:bg-sky-100" title={s}>
              “{s}”
            </button>
          ))}
        </div>
      )}

      {/* composer */}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 px-4 pb-4 pt-3 sm:px-5">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line text-xl text-navy hover:border-sky hover:bg-sky-50 disabled:opacity-50" aria-label="Attach a photo" title="Attach a photo">
          📎
        </button>
        <label className="sr-only" htmlFor="saral-input">Message</label>
        <input
          id="saral-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={lang === 'hi' ? 'लिखें या माइक दबाकर बोलें…' : 'Type, or tap the mic to speak…'}
          className="h-12 min-w-0 flex-1 rounded-full border border-line bg-canvas px-4 text-[15px] outline-none focus:border-sky focus:bg-white focus:ring-4 focus:ring-sky/15"
          disabled={busy === 'listening'}
        />
        {text.trim() ? (
          <button type="submit" disabled={!!busy} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-navy text-white hover:bg-sky disabled:bg-slate-300" aria-label="Send">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M3 20.5 21 12 3 3.5l2.5 7L15 12l-9.5 1.5L3 20.5Z" /></svg>
          </button>
        ) : (
          <MicButton />
        )}
      </form>
    </div>
  );
}
