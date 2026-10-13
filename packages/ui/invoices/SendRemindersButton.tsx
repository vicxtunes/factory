"use client";

import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { sendInvoiceReminders } from "@repo/lib/invoices/actions";

/** Staff remind every client who owes (a push, and an email where there's one): at most once a day each. */
export function SendRemindersButton() {
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  function send() {
    if (!window.confirm("Send a reminder to every client with unpaid invoices?")) return;
    setNote(null);
    start(async () => {
      const res = await sendInvoiceReminders();
      if (!res.ok) return setNote({ text: res.error, error: true });
      const { clients, reminded, emailed, emailsFailed } = res.data;
      const people = (n: number) => `${n} client${n === 1 ? "" : "s"}`;
      if (reminded > 0 && emailsFailed > 0) {
        return setNote({
          text: `Reminded ${people(reminded)} by notification, but ${emailsFailed} of ${emailed + emailsFailed} emails couldn't be sent. Check the email settings.`,
          error: true,
        });
      }
      setNote({
        text:
          clients === 0
            ? "Nobody owes anything."
            : reminded === 0
              ? "Everyone who owes was already reminded today."
              : `Reminded ${people(reminded)} (${emailed} by email too)${reminded < clients ? `; ${clients - reminded} already reminded today` : ""}.`,
      });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={send} loading={pending}>
        Send reminders
      </Button>
      {note ? <p className={`text-sm ${note.error ? "text-error-600" : "text-muted"}`}>{note.text}</p> : null}
    </div>
  );
}
