'use client';
import { useDispatch } from 'react-redux';
import { SOURCE_META } from '@/lib/format';
import { setViewDoc } from '@/store/journeySlice';

const STYLE = {
  voice: 'bg-sky-50 text-navy',
  chat: 'bg-sky-50 text-navy',
  document: 'bg-amber-50 text-amber-800',
  account: 'bg-slate-100 text-slate-700',
  policy: 'bg-indigo-50 text-indigo-700',
  memory: 'bg-violet-50 text-violet-700',
  user: 'bg-emerald-50 text-emerald-700',
};

// Shows where a value came from. For a document, it opens that document.
export default function SourceChip({ source, docId, page, verified, interactive = true }) {
  const dispatch = useDispatch();
  const m = SOURCE_META[source];
  if (!m) return null;
  const cls = `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STYLE[source] || ''}`;
  const body = (
    <>
      <span aria-hidden>{m.icon}</span>{m.label}{page ? ` · p${page}` : ''}{verified && source !== 'user' ? ' ✓' : ''}
    </>
  );
  if (interactive && source === 'document' && docId) {
    return (
      <button type="button" onClick={() => dispatch(setViewDoc(docId))} className={`${cls} underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky`} title="Open the document this came from">
        {body}
      </button>
    );
  }
  return <span className={cls} title={verified ? 'Confirmed' : undefined}>{body}</span>;
}
