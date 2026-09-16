import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { getClientSession } from "@/lib/auth/session";
import { fetchProductCatalog } from "@/lib/queries";

import { ClientShell } from "../shell";

export const metadata = { title: "Showroom — Client Portal" };
export const dynamic = "force-dynamic";

export default async function ShowroomPage() {
  const [session, catalog] = await Promise.all([getClientSession(), fetchProductCatalog(true)]);

  return (
    <ClientShell signedIn={!!session} name={session?.name ?? null}>
      {!session ? (
        <div className="mb-4 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs">
          <p className="text-sm text-muted">Sign in to place an order or track existing ones.</p>
          <Link href="/client-side">
            <Button className="mt-3">Sign in / Sign up</Button>
          </Link>
        </div>
      ) : null}

      <div className="space-y-6">
        {catalog.map((category) => (
          <section
            key={category.id}
            id={`category-${category.id}`}
            className="scroll-mt-20 rounded-[var(--radius)] border border-border bg-surface p-4 shadow-theme-xs"
          >
            <SectionLabel>{category.name}</SectionLabel>
            <ul className="mt-2 space-y-3">
              {category.products.map((product) => (
                <li key={product.id}>
                  <p className="font-medium">{product.name}</p>
                  {product.variants.length > 0 ? (
                    <p className="text-xs text-muted">
                      Options: {product.variants.map((v) => v.name).join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
              {category.products.length === 0 ? (
                <li className="text-sm text-muted">No products listed yet.</li>
              ) : null}
            </ul>
            {category.attributes.length > 0 ? (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                Customize:{" "}
                {category.attributes
                  .map((a) => (a.type === "select" ? `${a.name} (${(a.options ?? []).join(" / ")})` : a.name))
                  .join(" · ")}
              </p>
            ) : null}
          </section>
        ))}
        {catalog.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-border p-4 text-sm text-muted">
            Nothing in the showroom yet.
          </p>
        ) : null}
      </div>
    </ClientShell>
  );
}
