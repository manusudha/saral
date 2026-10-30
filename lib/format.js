// Shared helpers (safe to import on client and server)

export function inr(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n ?? '');
  return '₹' + Math.round(num).toLocaleString('en-IN');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function prettyDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function displayValue(def, value) {
  if (value === undefined || value === null || value === '') return '';
  if (def?.type === 'number') {
    if (def.key === 'tenureMonths') return `${value} months`;
    return inr(value);
  }
  if (def?.type === 'date') return prettyDate(value);
  return String(value);
}

export function detectLang(text) {
  if (!text) return null;
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  const hinglish = /\b(hai|hain|karna|karni|mera|mere|meri|mujhe|chahiye|nahi|nahin|haan|aur|papa|maa|kitna|kitne|hua|tha|thi|wala|kamai|kamata|mahine|kya|kaise|hota|hoon|hun|se|ke liye|ji)\b/i;
  if (hinglish.test(text)) return 'hi';
  const words = text.match(/[A-Za-z]{2,}/g) || [];
  return words.length >= 3 ? 'en' : null; // too short to tell (a PAN, a number) — keep the current language
}

export const SOURCE_META = {
  voice: { label: 'Voice', icon: '🎤' },
  chat: { label: 'Chat', icon: '💬' },
  document: { label: 'Document', icon: '📄' },
  account: { label: 'Paytm account', icon: '👤' },
  memory: { label: 'Remembered', icon: '🧠' },
  user: { label: 'Edited by you', icon: '✏️' },
};
