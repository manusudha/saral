export default function Logo({ light = false }) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky text-lg font-extrabold text-white shadow-sm">स</div>
      <div className="leading-tight">
        <div className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-navy'}`}>Saral</div>
        <div className={`text-[11px] font-medium ${light ? 'text-sky-100' : 'text-mute'}`}>for Paytm journeys</div>
      </div>
    </div>
  );
}
