"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field, Select, TextInput } from "@/components/ui/Field";
import {
  adjustWallet,
  confirmDeposit,
  getClientWallet,
  recordDeposit,
  rejectDeposit,
} from "@/lib/wallet/actions";
import { MANUAL_METHODS, MAX_ADJUSTMENT, MAX_DEPOSIT, METHOD_LABELS, MIN_DEPOSIT, checkAmount } from "@/lib/wallet/policy";
import type { PaymentMethod, PendingDeposit, WalletListRow, WalletView } from "@/lib/wallet/types";

import { BalanceCard, EntryLine, MethodOptions, Panel, PaymentLine, formatWhen, parseAmount, useMoney } from "./shared";

export interface WalletClientOption {
  id: string;
  name: string;
  phone: string | null;
}

// Staff's wallet screen (/dashboard/wallets):
//   1. Deposits clients reported, waiting for someone to check the
//      statement and confirm or reject them.
//   2. Every client with a wallet, and their balance. Opening one shows its
//      history and lets staff record a deposit (money taken at the counter or
//      seen on the statement) or make a correction.
export function WalletsAdmin({
  pending,
  wallets,
  clients,
}: {
  pending: PendingDeposit[];
  wallets: WalletListRow[];
  /** Every client, so staff can open a wallet for someone who doesn't have one yet. */
  clients: WalletClientOption[];
}) {
  const money = useMoney();
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newClientId, setNewClientId] = useState("");

  const q = search.trim().toLowerCase();
  const visible = q
    ? wallets.filter((w) => [w.clientName, w.phone].some((v) => v?.toLowerCase().includes(q)))
    : wallets;
  const withWallet = new Set(wallets.map((w) => w.clientId));
  const withoutWallet = clients.filter((c) => !withWallet.has(c.id));
  const total = wallets.reduce((sum, w) => sum + w.balance, 0);

  return (
    <div className="space-y-6">
      <Panel title={`To confirm (${pending.length})`}>
        {pending.length ? (
          <>
            <p className="text-xs text-muted">
              Clients say they&apos;ve sent these. Check the bank statement or mobile money account, then confirm — only
              confirmed money reaches their wallet.
            </p>
            <ul className="divide-y divide-border">
              {pending.map((p) => (
                <PendingRow key={p.id} deposit={p} />
              ))}
            </ul>
          </>
        ) : (
          <p className="py-2 text-sm text-muted">Nothing waiting.</p>
        )}
      </Panel>

      <Panel title="Wallets" aside={<span className="text-xs text-muted">Total held: {money(total)}</span>}>
        <div className="my-2 flex flex-wrap gap-2">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="max-w-xs"
          />
          {withoutWallet.length ? (
            <div className="flex gap-2">
              <Select value={newClientId} onChange={(e) => setNewClientId(e.target.value)} className="max-w-xs">
                <option value="">Open a wallet for…</option>
                {withoutWallet.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" disabled={!newClientId} onClick={() => setOpenClientId(newClientId)}>
                Open
              </Button>
            </div>
          ) : null}
        </div>
        {visible.length ? (
          <ul className="divide-y divide-border">
            {visible.map((w) => (
              <li key={w.clientId}>
                <button
                  type="button"
                  onClick={() => setOpenClientId(w.clientId)}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{w.clientName}</span>
                    <span className="block text-xs text-muted">
                      {w.phone ?? "No phone"}
                      {w.pendingCount ? ` · ${w.pendingCount} to confirm` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{money(w.balance)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted">{q ? "No wallet matches." : "No client has a wallet yet."}</p>
        )}
      </Panel>

      <ClientWalletDrawer clientId={openClientId} onClose={() => setOpenClientId(null)} />
    </div>
  );
}

function PendingRow({ deposit }: { deposit: PendingDeposit }) {
  const router = useRouter();
  const money = useMoney();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    if (!window.confirm(`Confirm ${money(deposit.amount)} from ${deposit.clientName}? It goes straight into their wallet.`)) return;
    setError(null);
    start(async () => {
      const res = await confirmDeposit(deposit.id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    start(async () => {
      const res = await rejectDeposit(deposit.id, reason);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {deposit.clientName} · <span className="tabular-nums">{money(deposit.amount)}</span>
          </p>
          <p className="break-words text-xs text-muted">
            {[METHOD_LABELS[deposit.method], deposit.reference ? `Ref ${deposit.reference}` : null, deposit.clientPhone, deposit.note]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-[11px] text-muted">{formatWhen(deposit.createdAt)}</p>
        </div>
        {!rejecting ? (
          <div className="flex gap-2">
            <Button className="min-h-9 text-xs" loading={pending} onClick={confirm}>
              Confirm
            </Button>
            <Button variant="secondary" className="min-h-9 text-xs" disabled={pending} onClick={() => setRejecting(true)}>
              Reject
            </Button>
          </div>
        ) : null}
      </div>
      {rejecting ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field label="Why can't it be confirmed? (the client sees this)">
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
            </Field>
          </div>
          <Button variant="danger" className="min-h-11 text-xs" loading={pending} onClick={reject}>
            Reject
          </Button>
          <button type="button" className="min-h-11 text-xs text-muted" onClick={() => setRejecting(false)}>
            Cancel
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
    </li>
  );
}

function ClientWalletDrawer({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<"deposit" | "adjust" | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    getClientWallet(clientId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setWallet(res.data);
        setLoadError(null);
      } else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function reload() {
    if (!clientId) return;
    const res = await getClientWallet(clientId);
    if (res.ok) setWallet(res.data);
    setForm(null);
    router.refresh();
  }

  function close() {
    setWallet(null);
    setForm(null);
    onClose();
  }

  const current = wallet && wallet.clientId === clientId ? wallet : null;

  return (
    <Drawer open={!!clientId} onClose={close} title={current ? `${current.clientName} — wallet` : "Wallet"}>
      {loadError ? <p className="text-sm text-error-600">{loadError}</p> : null}
      {current ? (
        <div className="space-y-4">
          <BalanceCard balance={current.balance}>
            <Button className="min-h-9 text-xs" onClick={() => setForm(form === "deposit" ? null : "deposit")}>
              Record deposit
            </Button>
            <Button variant="secondary" className="min-h-9 text-xs" onClick={() => setForm(form === "adjust" ? null : "adjust")}>
              Adjust
            </Button>
          </BalanceCard>

          {form === "deposit" ? <RecordDepositForm clientId={current.clientId} onDone={reload} /> : null}
          {form === "adjust" ? <AdjustForm clientId={current.clientId} balance={current.balance} onDone={reload} /> : null}

          {current.pending.length ? (
            <Panel title="Waiting for confirmation">
              <p className="text-xs text-muted">Confirm or reject these from the “To confirm” list.</p>
              <ul className="divide-y divide-border">
                {current.pending.map((p) => (
                  <PaymentLine key={p.id} payment={p} />
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="History">
            {current.entries.length ? (
              <ul className="divide-y divide-border">
                {current.entries.map((e) => (
                  <EntryLine key={e.id} entry={e} />
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-muted">No activity yet.</p>
            )}
          </Panel>

          {current.closed.length ? (
            <Panel title="Not confirmed">
              <ul className="divide-y divide-border">
                {current.closed.map((p) => (
                  <PaymentLine key={p.id} payment={p} />
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : !loadError ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : null}
    </Drawer>
  );
}

function RecordDepositForm({ clientId, onDone }: { clientId: string; onDone: () => Promise<void> }) {
  const money = useMoney();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    const amountError = checkAmount(value, { min: MIN_DEPOSIT, max: MAX_DEPOSIT });
    if (amountError) return setError(amountError);
    if (!window.confirm(`Add ${money(value)} to this wallet? Only record money you've actually received.`)) return;
    setError(null);
    start(async () => {
      const res = await recordDeposit(clientId, { amount: value, method, reference, note });
      if (!res.ok) return setError(res.error);
      await onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border p-3">
      <p className="text-sm font-semibold">Record a deposit you&apos;ve received</p>
      <Field label="Amount received">
        <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </Field>
      <Field label="Method">
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <MethodOptions methods={MANUAL_METHODS} />
        </Select>
      </Field>
      <Field label="Reference (optional)" hint="Receipt number, transaction ID…">
        <TextInput value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Note (optional)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
      <Button type="submit" loading={pending}>
        Add to wallet
      </Button>
    </form>
  );
}

function AdjustForm({ clientId, balance, onDone }: { clientId: string; balance: number; onDone: () => Promise<void> }) {
  const money = useMoney();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    const amountError = checkAmount(value, { min: 1, max: direction === "remove" ? Math.min(balance, MAX_ADJUSTMENT) : MAX_ADJUSTMENT });
    if (amountError) return setError(direction === "remove" && value > balance ? `The balance is only ${money(balance)}.` : amountError);
    if (!reason.trim()) return setError("Give a reason — it's kept in the wallet history.");
    setError(null);
    start(async () => {
      const res = await adjustWallet(clientId, direction === "add" ? value : -value, reason);
      if (!res.ok) return setError(res.error);
      await onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border p-3">
      <p className="text-sm font-semibold">Correct the balance</p>
      <p className="text-xs text-muted">
        For fixing mistakes, or money handed back to the client in cash. Deposits go through “Record deposit”; order refunds
        through the order.
      </p>
      <Field label="Direction">
        <Select value={direction} onChange={(e) => setDirection(e.target.value as "add" | "remove")}>
          <option value="add">Add to balance</option>
          <option value="remove">Take from balance</option>
        </Select>
      </Field>
      <Field label="Amount">
        <TextInput inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Reason (kept in the history, the client sees it)">
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
      {error ? <p className="text-xs text-error-600">{error}</p> : null}
      <Button type="submit" loading={pending}>
        Save adjustment
      </Button>
    </form>
  );
}
