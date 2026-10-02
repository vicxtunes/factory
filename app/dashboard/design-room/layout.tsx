import { notFound } from "next/navigation";

import { getDashboardSession } from "@/lib/auth/session";
import { SUPPORT_OWNER_EMAIL } from "@/lib/support/constants";

import { CATEGORIES, COMPONENTS } from "./registry";
import { RoomNav } from "./room-nav";

// Design Room — a private workbench for building and trying UI components
// before they go into the app (daisyUI-style catalog). Developer-only: anyone
// else gets a plain 404, so the route doesn't advertise itself. Sits outside
// the dashboard's (app) group on purpose — no dashboard shell, its own nav.

export const metadata = {
  title: "Design Room",
  robots: { index: false, follow: false },
};

export default async function DesignRoomLayout({ children }: LayoutProps<"/dashboard/design-room">) {
  const session = await getDashboardSession();
  if (session?.email !== SUPPORT_OWNER_EMAIL) notFound();

  const groups = CATEGORIES.map((category) => ({
    category,
    items: COMPONENTS.filter((c) => c.category === category).map(({ slug, name, status }) => ({ slug, name, status })),
  }));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-border bg-surface md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-b-0">
        <RoomNav groups={groups} />
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
