import { brandVars, DEFAULT_BRAND_COLOR } from "@repo/lib/studios/core";

/**
 * A studio's color over Aming's orange (packages/lib/studios/core/brand.ts),
 * set on :root so drawers and dialogs portalled outside the page wear it too.
 * On its public pages and in its owner's workspace; null: the neutral default.
 */
export function BrandStyle({ color }: { color: string | null }) {
  const vars = Object.entries(brandVars(color ?? DEFAULT_BRAND_COLOR))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return <style>{`:root{${vars}}`}</style>;
}
