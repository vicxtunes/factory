import { RelockAt, WalletLock } from "@repo/ui/wallet/WalletPin";
import { getMyPhone } from "@repo/lib/wallet/actions";
import { storedPin, unlockedUntil, vendorWallet } from "@repo/lib/wallet/vendor";

import { VendorFrame } from "../frame";
import { requireVendor } from "../vendor";
import { VendorWallet } from "./vendor-wallet";

export const metadata = { title: "Wallet" };

// A vendor's wallet: what studios paid them for jobs (less Aming's 10%),
// withdrawals to their phone, and every movement. Behind their wallet PIN,
// like a studio's Business card: nothing is loaded until it's unlocked.
export default async function VendorWalletPage() {
  const { session, vendor } = await requireVendor();
  const until = await unlockedUntil(session.client_id);
  return (
    <VendorFrame vendor={vendor} page="wallet">
      <div className="px-4 py-6 sm:px-6 lg:py-8">
        {until ? <Unlocked vendorId={vendor.id} until={until} /> : <WalletLock hasPin={!!(await storedPin(session.client_id))} label="Vendor wallet" />}
      </div>
    </VendorFrame>
  );
}

async function Unlocked({ vendorId, until }: { vendorId: string; until: number }) {
  const [wallet, phone] = await Promise.all([vendorWallet(vendorId), getMyPhone()]);
  return (
    <>
      <RelockAt until={until} />
      <VendorWallet wallet={wallet} phone={phone.ok ? phone.data : null} />
    </>
  );
}
