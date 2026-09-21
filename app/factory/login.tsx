"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { RoleSwitcher } from "@/components/ui/RoleSwitcher";
import { SectionLabel } from "@/components/ui/SectionLabel";
import type { GoogleIdentity } from "@/lib/auth/session";
import type { WorkerPublic } from "@/lib/types";

import { linkWorkerAccount, logoutWorker, requestWorkerAccess } from "./actions";

// Workers sign in with Google only. Not signed in → the Google button. Signed
// in with Google but not yet attached to a worker → attach: pick your name and
// enter your old PIN once, or ask to be added if you're not on the list.
// `requestStatus` is the state of this Google account's access request, if any.
export function WorkerLogin({
  workers,
  google,
  requestStatus,
}: {
  workers: WorkerPublic[];
  google: GoogleIdentity | null;
  requestStatus: "pending" | "rejected" | null;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-6 shadow-theme-sm">
      <SectionLabel>Worker sign-in</SectionLabel>
      {!google ? (
        <div className="space-y-3">
          <GoogleButton />
          <p className="text-xs text-muted">
            Sign in with your Google account. First time? You&apos;ll be asked who you are once.
          </p>
        </div>
      ) : requestStatus ? (
        <RequestStatus status={requestStatus} email={google.email} />
      ) : (
        <AttachWorker workers={workers} google={google} />
      )}
      <RoleSwitcher current="/factory" />
    </div>
  );
}

function RequestStatus({ status, email }: { status: "pending" | "rejected"; email: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {status === "pending"
          ? "Your request to be added is waiting for a supervisor to approve it. You'll get in as soon as they do."
          : "Your request wasn't approved. Please speak to a supervisor."}
      </p>
      {email ? <p className="text-xs text-muted">Signed in as {email}</p> : null}
      <Button
        variant="secondary"
        className="w-full"
        loading={pending} disabled={pending}
        onClick={() =>
          start(async () => {
            await logoutWorker();
            router.refresh();
          })
        }
      >
        Use a different Google account
      </Button>
    </div>
  );
}

function AttachWorker({ workers, google }: { workers: WorkerPublic[]; google: GoogleIdentity }) {
  const router = useRouter();
  const [mode, setMode] = useState<"attach" | "request">("attach");
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [name, setName] = useState(google.name ?? "");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  if (mode === "request") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => requestWorkerAccess({ name, phone, note }));
        }}
      >
        <p className="text-sm text-muted">
          Signed in as {google.email}. Tell us who you are — a supervisor will approve your request.
        </p>
        <Field label="Your name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Phone" hint="Optional">
          <TextInput type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Note" hint="Optional — e.g. which station you work at">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
        <Button variant="primary" type="submit" className="w-full" loading={pending} disabled={pending}>
          {pending ? "Sending…" : "Request access"}
        </Button>
        <button
          type="button"
          onClick={() => setMode("attach")}
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          I&apos;m already on the list
        </button>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => linkWorkerAccount(workerId, pin));
      }}
    >
      <p className="text-sm text-muted">
        Signed in as {google.email}. Who are you? Pick your name and enter your old PIN{" "}
        <strong>one last time</strong> to connect this Google account — after that you only need Google.
      </p>
      <Field label="Your name">
        <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.station ? ` — ${w.station}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Your previous PIN">
        <PasswordInput
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
        />
      </Field>
      {error ? <p className="text-sm text-[var(--rush)]">{error}</p> : null}
      <Button variant="primary" type="submit" className="w-full" loading={pending} disabled={pending || !workerId}>
        {pending ? "Checking…" : "Connect my account"}
      </Button>
      <button
        type="button"
        onClick={() => setMode("request")}
        className="text-xs text-muted underline-offset-2 hover:underline"
      >
        I&apos;m not on the list / don&apos;t remember my PIN
      </button>
    </form>
  );
}
