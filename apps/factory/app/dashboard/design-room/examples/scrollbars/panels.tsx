// Every scroll area gets the theme's scrollbar (packages/ui/theme.css):
// thin, no track, a soft brand-orange thumb. Scroll both panels; on
// Safari the thumb deepens to full orange under the pointer.
const ROWS = Array.from({ length: 30 }, (_, i) => `ORD-${5500 + i} · ${["Photo book 12x12", "A4 Normal board", "Canvas 20x30", "Lamination"][i % 4]}`);

export default function ScrollbarsPanels() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ul className="h-64 divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-surface text-sm">
        {ROWS.map((row) => (
          <li key={row} className="px-4 py-2.5">
            {row}
          </li>
        ))}
      </ul>
      <div className="h-64 overflow-auto rounded-2xl border border-border bg-surface p-4">
        <div className="grid w-[640px] grid-cols-6 gap-2">
          {Array.from({ length: 48 }, (_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-brand-50 dark:bg-brand-500/15" />
          ))}
        </div>
      </div>
    </div>
  );
}
