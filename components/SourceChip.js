import { SOURCE_META } from '@/lib/format';

const STYLE = {
  voice: 'bg-sky-50 text-navy',
  chat: 'bg-sky-50 text-navy',
  document: 'bg-amber-50 text-amber-800',
  account: 'bg-slate-100 text-slate-700',
  memory: 'bg-violet-50 text-violet-700',
  user: 'bg-emerald-50 text-emerald-700',
};

export default function SourceChip({ source }) {
  const m = SOURCE_META[source];
  if (!m) return null;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STYLE[source] || ''}`}>
      <span aria-hidden>{m.icon}</span>{m.label}
    </span>
  );
}
