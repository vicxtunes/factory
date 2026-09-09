import { Header } from "@/components/ui/Header";
import { getDesignerSession } from "@/lib/auth/session";
import { fetchDesignerItems, fetchDesigners } from "@/lib/queries";

import { Board } from "./board";
import { DesignerLogin } from "./login";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Graphics — Order Tracker" };
export const dynamic = "force-dynamic";

export default async function GraphicsPage() {
  const session = await getDesignerSession();

  if (!session) {
    const designers = await fetchDesigners(true);
    return (
      <>
        <Header surface="Graphics" />
        <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
          <DesignerLogin designers={designers} />
        </main>
      </>
    );
  }

  const items = await fetchDesignerItems(session.designer_id);

  return (
    <>
      <Header
        surface="Graphics"
        right={
          <>
            <span className="text-white/80">{session.name}</span>
            <LogoutButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4">
        <Board initialItems={items} designerId={session.designer_id} designerName={session.name} />
      </main>
    </>
  );
}
