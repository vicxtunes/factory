import Link from "next/link";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@repo/ui/studio-access/OnboardingWizard";
import { SetupFrame } from "@repo/ui/studio-access/SetupLayouts";
import { clientUrl } from "@repo/lib/client-portal/paths";
import { studioAccess } from "@repo/lib/studio-access/server";
import { stepsDone } from "@repo/lib/studio-access/core";
import { slugFromName } from "@repo/lib/studio-portal/core";
import { requireOwnStudio } from "@repo/lib/studios/server";

export const metadata = { title: "My Studio — AMING" };

// Where My Studio goes until the studio works: set-up (first time, or after
// Aming sent it back), waiting for review, or suspended.
export default async function StudioWelcomePage() {
  const { studio } = await requireOwnStudio();
  const a = await studioAccess.access(studio.id);
  if (a.status === "active") redirect("/studio");

  if (a.status === "in_review") {
    return (
      <Notice title={`${a.name} is being reviewed`}>
        <p>Thanks! Aming checks every new studio before it opens. You&apos;ll get an email at {a.ownerEmail} and a notification when it&apos;s done.</p>
        <p>Until then your public page is off and your clients can&apos;t sign in.</p>
      </Notice>
    );
  }
  if (a.status === "suspended") {
    return (
      <Notice title={`${a.name} is suspended`}>
        {a.reviewNote ? <p className="whitespace-pre-line rounded-xl bg-background p-3">{a.reviewNote}</p> : null}
        <p>Your workspace, public page and client sign-in are stopped. Talk to Aming to reopen it.</p>
        <Link href="/chat" className="font-medium text-brand-600 hover:underline">
          Message Aming
        </Link>
      </Notice>
    );
  }

  // Set-up starts from the owner's Aming name and phone, to confirm or change for the studio.
  const [first, ...rest] = a.client.name.trim().split(/\s+/);
  return (
    <OnboardingWizard
      view={{
        status: a.status,
        reviewNote: a.reviewNote,
        details: {
          name: a.name,
          ownerFirstName: a.ownerFirstName ?? first ?? "",
          ownerLastName: a.ownerLastName ?? rest.join(" "),
          phone: a.phone ?? a.client.phone ?? "",
        },
        detailsSaved: stepsDone(a).details,
        logoUrl: await studioAccess.logoUrl(a.logoKey),
        slug: a.slug,
        suggestedSlug: slugFromName(a.name),
        origin: clientUrl("/").replace(/\/$/, ""),
        ownerEmail: a.ownerEmail,
        emailVerified: !!a.ownerEmailVerifiedAt,
        hasPassword: !!a.passwordHash,
      }}
    />
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SetupFrame>
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed shadow-theme-xs">
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </div>
    </SetupFrame>
  );
}
