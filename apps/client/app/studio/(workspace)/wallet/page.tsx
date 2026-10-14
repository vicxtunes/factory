import { Skeleton } from "@repo/ui/Skeleton";
import { Loading } from "@repo/ui/skeletons/Loading";
import { BusinessCardAnalytics } from "@repo/ui/wallet/BusinessCardAnalytics";
import { WalletTerms } from "@repo/ui/wallet/WalletTerms";
import { requireStudio } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";
import { getMyPhone } from "@repo/lib/wallet/actions";
import { amingCardBalance, getBusinessCard } from "@repo/lib/wallet/studio";

export const metadata = { title: "Wallet · My Business" };

// The business's wallet and nothing else: its Business card (where clients'
// mobile money lands), beside the owner's Aming card, once the owner has
// agreed to the wallet's terms. Its sales, what clients
// owe and the order requests are on Accounts (../accounts).
export default async function StudioWalletPage() {
  const { scope, studio, access, session } = await requireStudio("money");

  return (
    <Loading skeleton={<Skeleton className="h-[40rem] w-full rounded-[2rem]" />}>
      <Card scope={scope} studio={studio} owner={access.owner ? session.name : null} />
    </Loading>
  );
}

// The card is in shillings, whatever currency the studio bills in. Only the
// owner moves money off it (to their Aming card, or out to their phone).
async function Card({ scope, studio, owner }: { scope: TenantScope; studio: { id: string; name: string; ownerClientId: string }; owner: string | null }) {
  const [card, amingBalance, phone] = await Promise.all([
    getBusinessCard(scope.tenantId, scope.timeZone),
    owner ? amingCardBalance(studio.ownerClientId) : 0,
    owner ? getMyPhone() : null,
  ]);
  // Off until the owner agrees to the wallet's terms: the terms stand in its place.
  if (!card.termsAccepted) return <WalletTerms owner={!!owner} />;
  return (
    <BusinessCardAnalytics
      business={{ id: studio.id, name: studio.name }}
      card={card}
      owner={owner ? { clientId: studio.ownerClientId, name: owner, amingBalance, phone: phone?.ok ? phone.data : null } : undefined}
    />
  );
}
