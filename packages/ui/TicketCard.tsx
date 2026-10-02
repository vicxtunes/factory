import type { ReactNode } from "react";

// Ticket-style summary card: a coloured strip (reference code + date) behind
// a white body (eyebrow, title, status pill), then a dashed tear line over
// the amount and actions. Design ref: public/design/E-Ticket Card Collection.
// Draft — lives in the Design Room until a page adopts it.

type Accent = "blue" | "green" | "yellow" | "pink";
type Tone = "info" | "warning" | "success" | "neutral";

const ACCENTS: Record<Accent, string> = {
  blue: "bg-indigo-300 dark:bg-indigo-500/30",
  green: "bg-emerald-200 dark:bg-emerald-500/25",
  yellow: "bg-yellow-200 dark:bg-yellow-500/25",
  pink: "bg-pink-200 dark:bg-pink-500/25",
};

const TONES: Record<Tone, string> = {
  info: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500",
  success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
  neutral: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300",
};

export function TicketCard({
  code,
  date,
  eyebrow,
  title,
  status,
  amount,
  actions,
  accent = "blue",
}: {
  code: string;
  date: string;
  eyebrow: string;
  title: string;
  status: { label: string; tone: Tone };
  amount: string;
  actions: ReactNode;
  accent?: Accent;
}) {
  return (
    <article className={`overflow-hidden rounded-2xl shadow-theme-lg ${ACCENTS[accent]}`}>
      <header className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-gray-900 dark:text-white">
        <span className="font-mono tracking-wide">{code}</span>
        <span className="tnum">{date}</span>
      </header>
      <div className="rounded-2xl bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted">{eyebrow}</p>
            <h3 className="mt-0.5 truncate text-lg font-medium">{title}</h3>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[status.tone]}`}>
            {status.label}
          </span>
        </div>
        <div className="my-4 border-t border-dashed border-border" />
        <div className="flex items-center justify-between gap-3">
          <span className="tnum text-xl font-semibold">{amount}</span>
          <div className="flex gap-2">{actions}</div>
        </div>
      </div>
    </article>
  );
}
