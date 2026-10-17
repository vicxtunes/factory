import { Skeleton } from "@repo/ui/Skeleton";
import { Loading } from "@repo/ui/skeletons/Loading";
import { BusinessCardAnalytics } from "@repo/ui/wallet/BusinessCardAnalytics";
import { WalletTerms } from "@repo/ui/wallet/WalletTerms";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { FEE_PERCENT, type BusinessKind } from "@repo/lib/studios/core";
import { getMyPhone } from "@repo/lib/wallet/actions";
import { amingCard, businessTermsAccepted, getBusinessCard, storedPin, unlockedUntil } from "@repo/lib/wallet/studio";
import { RelockAt, WalletLock } from "@repo/ui/wallet/WalletPin";

export const metadata = { title: "Wallet · My Business" };

// The business's wallet and nothing else: its Business card (where clients'
// mobile money lands), beside the owner's Aming card, once the owner has
// agreed to the wallet's terms. Its sales, what clients
// owe and the order requests are on Accounts (../accounts).
export default async function StudioWalletPage() {
  const { scope, studio, access, session } = await requireStudio("money");

  return (
    <Loading skeleton={<Skeleton className="h-[40rem] w-full rounded-[2rem]" />}>
      <Card scope={scope} studio={studio} viewerId={session.client_id} owner={access.owner ? session.name : null} />
    </Loading>
  );
}

// The card is in shillings, whatever currency the studio bills in. Only the
// owner moves money off it (to their Aming card, or out to their phone).
async function Card({
  scope,
  studio,
  viewerId,
  owner,
}: {
  scope: TenantScope;
  studio: { name: string; ownerClientId: string; kind: BusinessKind };
  viewerId: string;
  owner: string | null;
}) {
  // Off until the owner agrees to the wallet's terms: the terms stand in its place.
  if (!(await businessTermsAccepted(scope.tenantId))) return <WalletTerms owner={!!owner} feePercent={FEE_PERCENT[studio.kind]} />;
  // Its figures need the viewer's wallet PIN, so nothing is loaded until it's
  // unlocked. Just agreed to the terms: the next step is choosing the PIN.
  const until = await unlockedUntil(viewerId);
  if (!until) return <WalletLock hasPin={!!(await storedPin(viewerId))} />;
  const [card, aming, phone] = await Promise.all([
    getBusinessCard(scope.tenantId, scope.timeZone),
    owner ? amingCard(studio.ownerClientId) : null,
    owner ? getMyPhone() : null,
  ]);
  return (
    <>
      <RelockAt until={until} />
      <BusinessCardAnalytics
        studioName={studio.name}
        card={card}
        owner={owner && aming ? { name: owner, aming, phone: phone?.ok ? phone.data : null } : undefined}
      />
    </>
  );
}
