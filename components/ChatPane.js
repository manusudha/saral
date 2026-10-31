'use client';
import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sendTurn, uploadDoc, chooseOption, setError, setViewDoc } from '@/store/journeySlice';
import { fileToDataUrl, speakText, stopSpeaking, MAX_UPLOAD_BYTES, ACCEPTED_TYPES } from '@/lib/clientMedia';
import { inr } from '@/lib/format';
import MicButton from './MicButton';

const BUSY_LABEL = {
  thinking: 'Thinking…',
  reading: 'Reading your document…',
  listening: 'Listening — tap the red button when you’re done',
  transcribing: 'Understanding what you said…',
  submitting: 'Submitting…',
};

const DOC_LABEL = { hospitalBill: 'hospital bill', dischargeSummary: 'discharge summary', preAuthForm: 'pre-auth form', rejectionLetter: 'rejection letter' };
const SAMPLE_FILE = { hospitalBill: '/samples/hospital-bill.jpg', dischargeSummary: '/samples/discharge-summary.jpg' };

// Tappable example replies, keyed by what Saral is asking next (useful in a noisy hall)
const SUGGEST = {
  health_claim: {
    relationship: ['Mere papa ko dengue hai, Mumbai ke Apollo Hospital mein admit kiya hai', 'Papa dengue se admit the, 40 hazar ka bill aaya', 'My brother was admitted to Fortis hospital'],
    hospitalName: ['Shanti Care hospital, Mumbai', 'Apollo Hospital, Navi Mumbai', 'Lilavati Hospital, Mumbai'],
    hospitalCity: ['Navi Mumbai', 'Chennai', 'Mumbai'],
    admissionStatus: ['Abhi bhi admit hain', 'Discharge ho gaye, bill maine bhar diya'],
    cashlessStatus: ['Cashless use nahi kiya', 'Cashless reject ho gaya tha'],
    admissionDate: ['30 Oct 2026 ko admit hue'],
    diagnosis: ['Dengue'],
    estimatedCost: ['Estimate 1.2 lakh bataya hai'],
    upiId: ['amit.sharma@paytm'],
  },
  loan_precheck: {
    loanAmount: ['Mujhe 3 lakh ka loan chahiye, meri salary 60 hazar hai aur 8 hazar ki ek EMI chal rahi hai', 'I earn 45000 a month and want 5 lakh for 36 months'],
    employmentType: ['Naukri karta hoon, TCS mein', 'Apna business hai'],
    employerName: ['TCS', 'Infosys'],
    businessName: ['Sharma Traders'],
    workExperienceYears: ['5 saal ka experience'],
    monthlyIncome: ['Salary 60 hazar hai'],
    existingEmi: ['Koi EMI nahi', '8 hazar EMI'],
    tenureMonths: ['36 mahine', '24 mahine'],
    pan: ['ABCDE1234F'],
  },
};

function ExtractedCard({ card, onOpen }) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line bg-canvas/60">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <span className="text-xs font-semibold text-ink">📄 {card.fileName}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${card.readBy === 'ai' ? 'bg-emerald-50 text-ok' : 'bg-amber-50 text-warn'}`}>{card.readBy === 'ai' ? 'Read by AI' : 'Demo sample — not AI-read'}</span>
      </div>
      <dl className="divide-y divide-line text-sm">
        {card.fields.map((f) => (
          <div key={f.key} className="flex justify-between gap-3 px-3 py-1.5">
            <dt className="text-mute">{f.label.replace(/\s*\(₹\)/, '')}</dt>
            <dd className="text-right font-semibold text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>
      {card.lineItems?.length > 0 && (
        <details className="border-t border-line px-3 py-1.5 text-xs">
          <summary className="cursor-pointer text-mute">{card.lineItems.length} bill items</summary>
          <ul className="mt-1 space-y-0.5">
            {card.lineItems.map((li, i) => <li key={i} className="flex justify-between gap-2"><span>{li.description}</span><span className="tabular-nums">{inr(li.amount)}</span></li>)}
          </ul>
        </details>
      )}
      <button onClick={onOpen} className="w-full border-t border-line bg-white px-3 py-1.5 text-left text-xs font-semibold text-sky hover:bg-sky-50">View document{card.page ? ` (page ${card.page})` : ''}</button>
    </div>
  );
}

const STATUS_STYLE = { match: ['✓', 'text-ok', 'Match'], mismatch: ['✗', 'text-red-700', 'Mismatch'], missing: ['—', 'text-mute', 'Only on one document'] };
function ComparisonCard({ card }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-line bg-white">
      <div className="flex gap-3 border-b border-line px-2 py-1.5 text-[11px] text-mute"><span className="text-ok">✓ match</span><span className="text-red-700">✗ mismatch</span><span>— only on one</span></div>
      <table className="w-full text-xs">
        <thead className="bg-canvas text-mute">
          <tr><th className="px-2 py-1.5 text-left font-semibold">Detail</th><th className="px-2 py-1.5 text-left font-semibold capitalize">{card.aLabel}</th><th className="px-2 py-1.5 text-left font-semibold capitalize">{card.bLabel}</th><th className="px-2 py-1.5 text-center font-semibold"><span className="sr-only">Result</span></th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {card.rows.map((r) => (
            <tr key={r.field} className={r.status === 'mismatch' ? 'bg-red-50' : ''}>
              <td className="px-2 py-1.5 text-mute">{r.label.replace(/\s*\(₹\)/, '')}</td>
              <td className="px-2 py-1.5 text-ink">{r.fmtA}</td>
              <td className="px-2 py-1.5 text-ink">{r.fmtB}</td>
              <td className={`px-2 py-1.5 text-center text-sm font-bold ${STATUS_STYLE[r.status][1]}`} title={STATUS_STYLE[r.status][2]}><span aria-hidden>{STATUS_STYLE[r.status][0]}</span><span className="sr-only">{STATUS_STYLE[r.status][2]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ChatPane() {
  const dispatch = useDispatch();
  const { messages, busy, status, journey, lang, capabilities, error, stage, pending } = useSelector((s) => s.journey);
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy, error]);

  const next = status?.next;
  const suggestions = !pending && (next?.kind === 'field' || next?.kind === 'fix') ? SUGGEST[journey]?.[next.key] || [] : [];
  const lastSaralId = [...messages].reverse().find((m) => m.role === 'saral')?.id;

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
    if (!ACCEPTED_TYPES.includes(file.type)) { dispatch(setError(`“${file.name}” isn’t supported. Send a JPG, PNG or PDF.`)); return; }
    if (file.size > MAX_UPLOAD_BYTES) { dispatch(setError('That file is bigger than 10 MB. Send a smaller photo or PDF.')); return; }
    try {
      const dataUrl = await fileToDataUrl(file);
      dispatch(uploadDoc({ dataUrl, fileName: file.name }));
    } catch {
      dispatch(setError('That file couldn’t be opened. Send a JPG, PNG or PDF.'));
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
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-lg font-extrabold text-white">स</div>
        <div className="min-w-0 flex-1">
          <div className="font-bold leading-tight text-ink">Saral</div>
          <div className={`truncate text-xs ${busy ? 'text-sky' : 'text-mute'}`} aria-live="polite">
            {busy ? BUSY_LABEL[busy] : 'Speak or type in Hindi or English · send photos or PDFs'}
          </div>
        </div>
      </div>

      <div ref={listRef} className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas px-4 py-5 sm:px-5">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.kind === 'doc' ? (
              <div className="w-56 overflow-hidden rounded-2xl rounded-br-md border border-line bg-white shadow-sm">
                {m.imageUrl?.startsWith('data:application/pdf')
                  ? <div className="grid h-28 place-items-center bg-red-50 text-3xl" aria-hidden>📕</div>
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={m.imageUrl} alt={m.text} className="h-40 w-full object-cover object-top" />}
                <div className="truncate px-3 py-1.5 text-xs text-mute">📄 {m.text}</div>
              </div>
            ) : m.kind === 'docname' ? (
              <div className="rounded-2xl rounded-br-md bg-navy/80 px-4 py-2 text-sm text-white">📄 {m.text}</div>
            ) : (
              <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-navy text-white' : 'rounded-bl-md border border-line bg-white text-ink'}`}>
                {m.kind === 'voice' && <span className="mr-1 opacity-70" aria-label="spoken">🎤</span>}
                {m.text}
                {m.role === 'saral' && (
                  <button onClick={() => speakText(m.text, m.lang || lang, capabilities.tts)} className="ml-2 rounded align-middle text-xs text-mute opacity-60 hover:text-navy hover:opacity-100 focus-visible:opacity-100" aria-label="Play this message" title="Play">🔊</button>
                )}
                {(m.cards || []).map((c, i) => (c.type === 'extracted'
                  ? <ExtractedCard key={i} card={c} onOpen={() => dispatch(setViewDoc(c.docId))} />
                  : <ComparisonCard key={i} card={c} />))}
                {m.pending && m.id === lastSaralId && pending && (
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choose the correct value">
                    {pending.options.map((o, i) => (
                      <button key={i} onClick={() => dispatch(chooseOption({ index: i }))} disabled={!!busy} className="rounded-xl border border-sky bg-sky-50 px-3 py-2 text-left text-sm hover:bg-sky-100 disabled:opacity-50">
                        <div className="font-bold text-navy">{o.display || String(o.value)}</div>
                        <div className="text-xs text-mute">Use {o.label.toLowerCase()}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && busy !== 'listening' && (
          <div className="flex justify-start">
            <div className="dots rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 text-xl leading-none text-mute"><span>•</span><span>•</span><span>•</span></div>
          </div>
        )}
        {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">{error}</div>}
      </div>

      {stage === 'chat' && !busy && !pending && (next?.kind === 'doc' || suggestions.length > 0) && (
        <div className="flex flex-wrap gap-2 border-t border-line px-4 pt-3 sm:px-5">
          {next?.kind === 'doc' && (
            <>
              <button onClick={() => fileRef.current?.click()} className="rounded-full bg-sky px-3.5 py-2 text-sm font-semibold text-white hover:bg-navy">📷 Upload {DOC_LABEL[next.key] || 'document'}</button>
              {SAMPLE_FILE[next.key] && <button onClick={() => sendSample(next.key)} className="rounded-full border border-line px-3.5 py-2 text-sm font-medium text-mute hover:border-sky hover:text-navy">Use sample {DOC_LABEL[next.key]}</button>}
            </>
          )}
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="max-w-full truncate rounded-full border border-sky/40 bg-sky-50 px-3.5 py-2 text-left text-sm text-navy hover:bg-sky-100" title={s}>“{s}”</button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2 px-4 pb-4 pt-3 sm:px-5">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onFile} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-line text-xl text-navy hover:border-sky hover:bg-sky-50 disabled:opacity-50" aria-label="Attach a photo or PDF" title="Attach a photo or PDF">📎</button>
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
