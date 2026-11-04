"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { Field, TextInput } from "@repo/ui/Field";
import { FormSheet } from "@repo/ui/FormSheet";
import { addAgentClient, editAgentClient } from "@repo/lib/agents/actions";

type Contact = { name: string; phone: string; email: string };

function ClientSheet({ open, onClose, title, start: initial, save, done }: { open: boolean; onClose: () => void; title: string; start: Contact; save: (c: Contact) => Promise<{ ok: true } | { ok: false; error: string }>; done?: string | null }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (key: keyof Contact) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <FormSheet open={open} onClose={onClose} title={title}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm">{done}</p>
          <Button type="button" className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await save(form);
              if (!res.ok) setError(res.error);
            });
          }}
        >
          <Field label="Name">
            <TextInput value={form.name} onChange={set("name")} required />
          </Field>
          <Field label="Phone">
            <TextInput type="tel" value={form.phone} onChange={set("phone")} required />
          </Field>
          <Field label="Email (optional)">
            <TextInput type="email" value={form.email} onChange={set("email")} />
          </Field>
          {error ? <p className="text-sm text-error-600">{error}</p> : null}
          <Button type="submit" className="w-full" loading={pending} disabled={pending}>
            Save
          </Button>
        </form>
      )}
    </FormSheet>
  );
}

export function AddClientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // A fresh form each time it opens.
  const [round, setRound] = useState(0);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add client
      </Button>
      <ClientSheet
        key={round}
        open={open}
        title="Add client"
        start={{ name: "", phone: "", email: "" }}
        done={done}
        onClose={() => {
          setOpen(false);
          setDone(null);
          setRound((r) => r + 1);
        }}
        save={async (contact) => {
          const res = await addAgentClient(contact);
          if (!res.ok) return res;
          setDone(res.data?.pending ? "This person is already on Aming, so staff will check before they join your list. We'll tell you the answer." : "Added to your clients.");
          router.refresh();
          return { ok: true };
        }}
      />
    </>
  );
}

export function EditClientButton({ clientId, contact }: { clientId: string; contact: Contact }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Edit details
      </Button>
      <ClientSheet
        open={open}
        title="Edit client"
        start={contact}
        onClose={() => setOpen(false)}
        save={async (next) => {
          const res = await editAgentClient(clientId, next);
          if (!res.ok) return res;
          setOpen(false);
          router.refresh();
          return { ok: true };
        }}
      />
    </>
  );
}
