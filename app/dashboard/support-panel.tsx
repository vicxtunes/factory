"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { Linkify } from "@/components/ui/Linkify";
import { chatHref } from "@/lib/chat/routes";
import { deleteSupportReport, openSupportReportChat, setSupportReportStatus } from "@/lib/support/actions";
import type { ExportColumn } from "@/lib/export/tableExport";
import type { SupportReport } from "@/lib/types";

const SURFACE_LABELS: Record<string, string> = {
  dashboard_user: "Dashboard",
  worker: "Factory",
  designer: "Graphics",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface ReportExportRow extends Record<string, unknown> {
  reporter: string;
  surface: string;
  status: string;
  submitted: string;
  body: string;
}

const EXPORT_COLUMNS: ExportColumn<ReportExportRow>[] = [
  { key: "reporter", label: "Reporter" },
  { key: "surface", label: "Surface" },
  { key: "status", label: "Status" },
  { key: "submitted", label: "Submitted" },
  { key: "body", label: "Report" },
];

function ReportCard({ report, onChanged }: { report: SupportReport; onChanged: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else onChanged();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-theme-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {report.author_name}
            {report.author_role ? (
              <span className="ml-1 text-xs font-normal capitalize text-muted">
                ({report.author_role})
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted">
            {SURFACE_LABELS[report.author_type] ?? report.author_type} · {formatWhen(report.created_at)}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            report.status === "resolved"
              ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500"
              : "bg-[var(--urgent)]/15 text-[var(--urgent)]"
          }`}
        >
          {report.status === "resolved" ? "Resolved" : "Open"}
        </span>
      </div>

      <Linkify text={report.body} className="mt-2 text-sm" />

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {/* Joins (or creates) the report's private chat, then opens it. */}
        <Button
          variant="secondary"
          className="min-h-9 text-xs"
          loading={pending}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await openSupportReportChat(report.id);
              if (!res.ok) setError(res.error);
              else router.push(chatHref(res.data.conversationId));
            })
          }
        >
          Open chat
        </Button>
        {report.status === "open" ? (
          <Button
            variant="primary"
            className="min-h-9 text-xs"
            loading={pending} disabled={pending}
            onClick={() => run(() => setSupportReportStatus(report.id, true))}
          >
            Mark resolved
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="min-h-9 text-xs"
            loading={pending} disabled={pending}
            onClick={() => run(() => setSupportReportStatus(report.id, false))}
          >
            Reopen
          </Button>
        )}
        <Button
          variant="danger"
          className="min-h-9 text-xs"
          loading={pending} disabled={pending}
          onClick={() => {
            if (window.confirm("Delete this report?")) run(() => deleteSupportReport(report.id));
          }}
        >
          Delete
        </Button>
        {error ? <p className="text-xs text-error-600">{error}</p> : null}
      </div>
    </div>
  );
}

export function SupportPanel({ reports }: { reports: SupportReport[] }) {
  const router = useRouter();
  const [showResolved, setShowResolved] = useState(false);

  const open = reports.filter((r) => r.status === "open");
  const resolved = reports.filter((r) => r.status === "resolved");
  const visible = showResolved ? reports : open;

  const exportRows: ReportExportRow[] = reports.map((r) => ({
    reporter: r.author_name,
    surface: SURFACE_LABELS[r.author_type] ?? r.author_type,
    status: r.status === "resolved" ? "Resolved" : "Open",
    submitted: formatWhen(r.created_at),
    body: r.body,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ExportButtons columns={EXPORT_COLUMNS} rows={exportRows} filename="support-reports" />
        <label className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          Show resolved
          {resolved.length > 0 ? <span className="tnum">({resolved.length})</span> : null}
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[var(--radius)] border border-dashed border-border p-4 text-sm text-muted">
          {showResolved ? "No reports yet." : "No open reports — nice."}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <ReportCard key={r.id} report={r} onChanged={() => router.refresh()} />
          ))}
        </div>
      )}
    </div>
  );
}
