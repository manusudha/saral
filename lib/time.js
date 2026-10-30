export function istTime(iso, withDate = true) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    ...(withDate ? { day: 'numeric', month: 'short' } : {}),
    hour: '2-digit', minute: '2-digit', second: withDate ? undefined : '2-digit', hour12: true,
  });
}
