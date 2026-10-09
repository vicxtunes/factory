import { notFound } from "next/navigation";

import { SetupFrame } from "@repo/ui/studio-access/SetupLayouts";
import { getClientSession } from "@repo/lib/auth/session";
import { STUDIOS_ENABLED } from "@repo/lib/studios/feature";
import { studios } from "@repo/lib/studios/server";
import { AREA_LABELS, inviteTokenSchema } from "@repo/lib/team/core";
import { team } from "@repo/lib/team/server";

import { AuthGate } from "../../../../auth-gate";
import { JoinButton, JoinPin } from "./join-steps";

export const metadata = { title: "Join a business · Aming" };

// A team member's invite link (sent by the business's owner from Team). They
// sign in to their own Aming account, add a PIN if it has none (so no one can
// open the business with just their phone number), and join.
export default async function JoinTeamPage({ params }: { params: Promise<{ token: string }> }) {
  if (!STUDIOS_ENABLED) notFound();
  const token = inviteTokenSchema.safeParse((await params).token);
  const invite = token.success ? await team.byInvite(token.data) : null;
  const found = invite ? await studios.get(invite.tenantId) : null;
  const studio = found?.status === "active" ? found : null;
  const session = await getClientSession();

  return (
    <SetupFrame>
      <div className="space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-theme-xs">
        {!invite || !studio ? (
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">This invite link doesn&apos;t work</h1>
            <p className="text-sm text-muted">It may have expired or been replaced. Ask the business&apos;s owner to send you a new one.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Join {studio.name}</h1>
              <p className="text-sm text-muted">
                {studio.name} added you to their team as {invite.member.name}
                {invite.member.role ? ` (${invite.member.role})` : ""}. Once you join, you can:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>See and work on the tasks given to you</li>
                {invite.member.access.map((a) => (
                  <li key={a}>
                    {AREA_LABELS[a].label}: {AREA_LABELS[a].hint.toLowerCase()}
                  </li>
                ))}
              </ul>
            </div>
            {!session ? (
              <div className="space-y-2">
                <p className="text-sm">Sign in with your own Aming account, or make one with your phone number.</p>
                <AuthGate />
              </div>
            ) : !(await team.hasPin(session.client_id)) ? (
              <JoinPin name={session.name} />
            ) : (
              <JoinButton token={token.data!} name={session.name} />
            )}
          </>
        )}
      </div>
    </SetupFrame>
  );
}
