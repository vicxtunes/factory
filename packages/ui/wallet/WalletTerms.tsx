"use client";

// What stands where a business's wallet would be until its owner has agreed
// to the wallet's terms (packages/lib/wallet/terms.ts): the terms, and for
// the owner the box to tick and the button that turns the Business card on.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@repo/ui/Button";
import { acceptWalletTerms } from "@repo/lib/wallet/actions";
import { walletTerms } from "@repo/lib/wallet/terms";

import { TILE } from "./MoneyCards";

/** `feePercent`: what Aming keeps of this business's customer payments (its kind's rate). */
export function WalletTerms({ owner, feePercent }: { owner: boolean; feePercent: number }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section aria-labelledby="wallet-terms" className={TILE}>
      <h2 id="wallet-terms" className="text-xl font-semibold">
        Wallet terms
      </h2>
      <p className="mt-1 text-sm text-muted">
        {owner
          ? "Your Business card is off until you agree to these. Until then your customers aren't offered mobile money in the app: they pay you directly, and you record it."
          : "This business's wallet is off until its owner agrees to these. Until then its customers aren't offered mobile money in the app."}
      </p>
      <ol className="mt-5 space-y-4">
        {walletTerms(feePercent).map((section, i) => (
          <li key={section.title}>
            <h3 className="text-sm font-semibold">
              {i + 1}. {section.title}
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {owner ? (
        <form
          className="mt-6 space-y-4 border-t border-border pt-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await acceptWalletTerms();
              if (!res.ok) return setError(res.error);
              router.refresh();
            });
          }}
        >
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand-500" />
            <span>I&apos;ve read these terms and agree to them for my business.</span>
          </label>
          {error ? <p className="text-sm text-error-600 dark:text-error-400">{error}</p> : null}
          <Button type="submit" className="w-full" loading={pending} disabled={pending || !agreed}>
            Agree and turn on my Business card
          </Button>
        </form>
      ) : null}
    </section>
  );
}
