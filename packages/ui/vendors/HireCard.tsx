import Link from "next/link";

/**
 * A vendor's hire card: what they do and where, their picture and name, taking
 * work or busy, two buttons, and a line of their own on the strip beneath.
 * In `preview` (the vendor's own home) the buttons show but go nowhere.
 */
export function HireCard({
  role,
  place,
  name,
  photoUrl,
  available,
  line,
  hire,
  work,
  preview = false,
}: {
  role: string;
  place: string | null;
  name: string;
  photoUrl: string | null;
  available: boolean;
  line: string;
  /** Where "Hire me" and "See my work" go. */
  hire: string;
  work: string;
  preview?: boolean;
}) {
  const button = "flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]";
  const buttons = [
    { label: "Hire me", href: hire, icon: <path d="M12 8v8M8 12h8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /> },
    { label: "See my work", href: work, icon: <path d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5h.01" /> },
  ];

  return (
    <div className="rounded-[28px] bg-lime-400 shadow-theme-md">
      <div className="space-y-5 rounded-[28px] bg-gradient-to-b from-gray-900 to-gray-950 p-5 text-white ring-1 ring-black/40">
        <div className="flex items-center justify-between gap-3 text-sm text-white/55">
          <span className="truncate">{role}</span>
          {place ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              </svg>
              {place}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-white/90 text-xl font-semibold text-gray-900 ring-4 ring-white/10">
            {photoUrl ? (
              // A short-lived signed link to the private bucket: a plain img.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="size-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xl font-medium">{name}</span>
            <span className="mt-0.5 flex items-center gap-2 text-sm text-white/55">
              <span className={`size-2 rounded-full ${available ? "bg-lime-400" : "bg-white/30"}`} />
              {available ? "Available for work" : "Busy for now"}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {buttons.map((b) =>
            preview ? (
              <span key={b.label} aria-hidden className={button}>
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {b.icon}
                </svg>
                {b.label}
              </span>
            ) : (
              <Link key={b.label} href={b.href} className={`${button} transition hover:bg-white/15`}>
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {b.icon}
                </svg>
                {b.label}
              </Link>
            ),
          )}
        </div>
      </div>
      <p className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-900">
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        </svg>
        <span className="truncate">{line}</span>
      </p>
    </div>
  );
}
