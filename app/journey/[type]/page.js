'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { startJourney, setLang, setAutoSpeak, addSaralMessage } from '@/store/journeySlice';
import { speakText, stopSpeaking } from '@/lib/clientMedia';
import { inr } from '@/lib/format';
import Logo from '@/components/Logo';
import ChatPane from '@/components/ChatPane';
import LiveForm from '@/components/LiveForm';
import ReviewPanel from '@/components/ReviewPanel';
import SuccessPanel from '@/components/SuccessPanel';
import { DocViewer } from '@/components/Insights';

function Status({ on, onLabel, offLabel, title }) {
  return (
    <span title={title} className={`hidden items-center gap-1.5 whitespace-nowrap text-xs font-medium xl:inline-flex ${on ? 'text-ok' : 'text-mute'}`}>
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-ok' : 'bg-slate-300'}`} />
      {on ? onLabel : offLabel}
    </span>
  );
}

function useProgress() {
  const { status, fields, docs } = useSelector((s) => s.journey);
  if (!status?.required) return { done: 0, total: 0, pct: 0 };
  const done = status.required.filter((k) => fields[k]?.value !== undefined && fields[k]?.value !== '').length
    + (status.requiredDocs || []).filter((d) => docs[d]).length;
  const total = status.required.length + (status.requiredDocs || []).length;
  return { done, total, pct: Math.round((done / Math.max(total, 1)) * 100) };
}

export default function JourneyPage() {
  const { type } = useParams();
  const dispatch = useDispatch();
  const { stage, capabilities, lang, autoSpeak, messages, result, journey, schema, busy, changeNonce, resumed } = useSelector((s) => s.journey);
  const spokenRef = useRef(0);
  const startedRef = useRef(null);
  const [tab, setTab] = useState('chat'); // small screens only: which pane is showing
  const [formPing, setFormPing] = useState(false);
  const progress = useProgress();

  // Start the journey once. React's development mode runs effects twice; without this guard
  // two journeys started, two greetings arrived and both were spoken at once (the echo).
  useEffect(() => {
    if (startedRef.current === type) return;
    startedRef.current = type;
    stopSpeaking();
    setTab('chat');
    dispatch(startJourney({ journey: type }));
  }, [type, dispatch]);

  useEffect(() => () => stopSpeaking(), []);

  // Speak each new Saral message once — never while the mic is recording
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'saral') return;
    if (last.id <= spokenRef.current) return;
    spokenRef.current = last.id;
    if (last.restored) return;
    if (autoSpeak && busy !== 'listening') speakText(last.text, last.lang || lang, capabilities.tts);
  }, [messages, autoSpeak, lang, capabilities.tts, busy]);

  // On small screens, show a dot on the Form tab when fields change
  useEffect(() => {
    if (changeNonce > 1 && tab === 'chat') setFormPing(true);
  }, [changeNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move to the form pane on small screens when it's time to review
  useEffect(() => {
    if (stage !== 'chat') setTab('form');
  }, [stage]);

  // Announce the result in the chat after submit
  useEffect(() => {
    if (!result) return;
    const text = journey === 'health_claim'
      ? (lang === 'hi'
        ? `आपका क्लेम सबमिट हो गया! रेफ़रेंस नंबर ${result.id}। लगभग ${inr(result.amount)} आपके UPI पर आएँगे — स्टेटस मैं आपको बताता रहूँगा।`
        : `Your claim is submitted! Reference ${result.id}. About ${inr(result.amount)} will come to your UPI — I'll keep you posted.`)
      : (lang === 'hi'
        ? `${result.headline === 'You are pre-approved' ? 'बधाई हो, आपका लोन प्री-अप्रूव्ड है!' : 'आपका प्री-चेक पूरा हुआ।'} रेफ़रेंस नंबर ${result.id}।`
        : `${result.headline}. Reference ${result.id}.`);
    dispatch(addSaralMessage({ text, lang }));
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      {/* app bar */}
      <header className="relative z-10 shrink-0 border-b border-line bg-white">
        <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
          <Link href="/" aria-label="Saral home" className="shrink-0"><Logo /></Link>
          <div className="hidden h-8 w-px bg-line md:block" />
          <div className="hidden min-w-0 md:block">
            <div className="truncate text-sm font-bold text-ink">{schema?.title || '…'}</div>
            <div className="truncate text-xs text-mute">{progress.done} of {progress.total} done</div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Status on={capabilities.ai} onLabel="AI live" offLabel="AI offline (demo)" title="Is a real AI model connected?" />
            <Status on={capabilities.stt} onLabel="Sarvam voice" offLabel="Browser voice" title="Which speech engine is used" />
            <button onClick={() => { stopSpeaking(); setTab('chat'); dispatch(startJourney({ journey: type, fresh: true })); }} className="whitespace-nowrap text-sm font-medium text-mute hover:text-navy">Start over</button>
            <Link href="/submissions" className="hidden whitespace-nowrap text-sm font-medium text-mute hover:text-navy lg:inline">Past submissions</Link>
            <div className="flex overflow-hidden rounded-full border border-line text-xs font-bold" role="group" aria-label="Reply language">
              {[['hi', 'हिंदी'], ['en', 'EN']].map(([k, l]) => (
                <button key={k} onClick={() => dispatch(setLang(k))} aria-pressed={lang === k} className={`px-3 py-1.5 ${lang === k ? 'bg-navy text-white' : 'text-mute hover:text-navy'}`}>{l}</button>
              ))}
            </div>
            <button
              onClick={() => { if (autoSpeak) stopSpeaking(); dispatch(setAutoSpeak(!autoSpeak)); }}
              aria-pressed={autoSpeak}
              className={`grid h-8 w-8 place-items-center rounded-full border text-sm ${autoSpeak ? 'border-sky bg-sky-50' : 'border-line'}`}
              title={autoSpeak ? 'Saral reads replies aloud — click to mute' : 'Replies are muted — click to hear them'}
              aria-label={autoSpeak ? 'Mute spoken replies' : 'Turn on spoken replies'}
            >
              {autoSpeak ? '🔊' : '🔇'}
            </button>
          </div>
        </div>
        {/* progress across the whole app */}
        <div className="absolute inset-x-0 bottom-0 h-[3px] translate-y-full bg-transparent">
          <div className="h-full bg-sky transition-all duration-700 ease-out" style={{ width: `${progress.pct}%` }} />
        </div>
      </header>

      {resumed && stage === 'chat' && (
        <div className="shrink-0 border-b border-sky/30 bg-sky-50 px-4 py-2 text-center text-sm text-navy sm:px-6">Picked up where you left off. <button onClick={() => dispatch(startJourney({ journey: type, fresh: true }))} className="font-semibold underline">Start a new one instead</button></div>
      )}
      <DocViewer />
      {/* small screens: switch between chat and form */}
      <div className="flex shrink-0 border-b border-line bg-white lg:hidden" role="tablist">
        {[['chat', 'Chat'], ['form', stage === 'review' ? 'Review' : stage === 'success' ? 'Done' : `Form · ${progress.pct}%`]].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => { setTab(k); if (k === 'form') setFormPing(false); }}
            className={`relative flex-1 py-3 text-sm font-semibold ${tab === k ? 'text-navy' : 'text-mute'}`}
          >
            {l}
            {k === 'form' && formPing && tab !== 'form' && <span className="absolute right-[30%] top-3 h-2 w-2 rounded-full bg-sky" />}
            {tab === k && <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-full bg-navy" />}
          </button>
        ))}
      </div>

      {/* workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(380px,32%)_minmax(0,1fr)]">
        <section aria-label="Conversation with Saral" className={`min-h-0 border-line lg:block lg:border-r ${tab === 'chat' ? 'block' : 'hidden'}`}>
          <ChatPane />
        </section>
        <section aria-label="Form" className={`scroll-thin min-h-0 overflow-y-auto lg:block ${tab === 'form' ? 'block' : 'hidden'}`}>
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 lg:py-8">
            {stage === 'chat' && <LiveForm />}
            {stage === 'review' && <ReviewPanel />}
            {stage === 'success' && <SuccessPanel />}
          </div>
        </section>
      </div>
    </main>
  );
}
