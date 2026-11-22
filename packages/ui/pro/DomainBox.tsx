"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { checkDomainDns, removeDomain, requestDomain } from "@repo/lib/pro/actions";
import { SERVER_IP, type ProStatus } from "@repo/lib/pro/core";

/**
 * Pro's own domain (owner, 2026-11-22): the owner types the domain they
 * bought, adds one record where they bought it, and Aming connects it. While
 * it's waiting: the record to add and a check that it's there.
 */
export function DomainBox({ domain, pro }: { domain: ProStatus["domain"]; pro: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(domain?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function ask() {
    setError(null);
    start(async () => {
      const res = await requestDomain(value);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      setCheck(null);
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const res = await removeDomain();
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function checkNow() {
    setCheck(null);
    start(async () => {
      const res = await checkDomainDns();
      if (!res.ok) return setCheck(res.error);
      setCheck(
        res.data.pointsHere
          ? "The record is there. Aming will connect your domain soon; you'll see it here when it's on."
          : res.data.found.length
            ? `Not yet: your domain points to ${res.data.found.join(", ")}, not ${SERVER_IP}. Change the record, then check again (changes can take a few hours).`
            : "Not yet: we can't find the record. Add it, then check again (changes can take a few hours).",
      );
    });
  }

  return (
    <div className="mt-5 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Your own domain</p>
          {domain ? (
            domain.live && pro ? (
              <p className="text-sm text-muted">
                Your page is on{" "}
                <a href={`https://${domain.name}`} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-4">
                  {domain.name}
                </a>
                .
              </p>
            ) : !pro ? (
              <p className="text-sm text-muted">{domain.name} is off until you have Pro again.</p>
            ) : (
              <p className="text-sm text-muted">{domain.name}: waiting for Aming to connect it.</p>
            )
          ) : (
            <p className="text-sm text-muted">{pro ? "Show your page on a domain you bought, like yourbusiness.com." : "With Pro, your page can be on a domain you bought, like yourbusiness.com."}</p>
          )}
        </div>
        {pro ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setValue(domain?.name ?? "");
                setError(null);
                setOpen(true);
              }}
            >
              {domain ? "Change" : "Add my domain"}
            </Button>
            {domain ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
                Remove
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {domain && !domain.live && pro ? (
        <div className="mt-3 space-y-3 text-sm">
          <p>Where you bought {domain.name}, add this record in its DNS settings:</p>
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-background p-3 font-mono text-xs sm:max-w-md">
            <div>
              <dt className="text-muted">Type</dt>
              <dd className="font-semibold">A</dd>
            </div>
            <div>
              <dt className="text-muted">Name / Host</dt>
              <dd className="font-semibold">{domain.name.startsWith("www.") ? "www" : "@"}</dd>
            </div>
            <div>
              <dt className="text-muted">Value / Points to</dt>
              <dd className="font-semibold break-all">{SERVER_IP}</dd>
            </div>
          </dl>
          <Button type="button" variant="secondary" loading={pending} onClick={checkNow}>
            Check the record
          </Button>
          {check ? <p className="text-muted">{check}</p> : null}
        </div>
      ) : null}
      {error && !open ? <p className="mt-2 text-sm text-error-600 dark:text-error-400">{error}</p> : null}

      <FormSheet open={open} onClose={() => setOpen(false)} title="Your own domain">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <p className="text-sm text-muted">Type the domain you bought. Next you&apos;ll add one record where you bought it, and Aming connects it, usually within a day.</p>
          <Field label="Domain">
            <TextInput value={value} onChange={(e) => setValue(e.target.value)} placeholder="yourbusiness.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
          </Field>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="submit" className="w-full" loading={pending}>
            Ask Aming to connect it
          </Button>
        </form>
      </FormSheet>
    </div>
  );
}
