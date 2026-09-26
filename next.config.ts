import type { NextConfig } from "next";

import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  // "standalone" is for the self-hosted Docker image (see Dockerfile). Vercel
  // has its own serverless output tracing and the two conflict — building
  // with standalone output on Vercel fails with a missing
  // `.next/next-server.js.nft.json` trace file. Skip it when Vercel is doing
  // the build (it sets VERCEL=1).
  output: process.env.VERCEL ? undefined : "standalone",
  experimental: {
    serverActions: {
      // Server Actions reject requests whose Origin doesn't match the host.
      // Codespaces / other reverse proxies serve the app on a different domain.
      allowedOrigins: [
        "*.app.github.dev",
        "*.githubpreview.dev",
        "localhost:3000",
        "localhost:3911",
      ],
    },
    // Connectivity-aware retry: a Server Action or navigation started while
    // offline stays pending (button disabled) and resolves once the network
    // returns, instead of throwing. See app/dashboard/offline-banner.tsx.
    useOffline: true,
    // Instant page switching: the router keeps each visited or prefetched
    // page in memory for 5 minutes, so going back to it shows it at once
    // instead of a loading skeleton. (Next's default for dynamic pages is 0,
    // i.e. re-fetch on every visit.) components/navigation/KeepFresh.tsx
    // then refreshes the data quietly in the background, and any Server
    // Action that calls revalidatePath/router.refresh clears the copy.
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
};

export default withSerwist(nextConfig);
