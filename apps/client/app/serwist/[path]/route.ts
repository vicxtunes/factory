import { spawnSync } from "node:child_process";

import { createSerwistRoute } from "@serwist/turbopack";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  // Shared by both apps; relative to this app's folder.
  swSrc: "../../packages/ui/pwa/sw.ts",
  useNativeEsbuild: true,
});
