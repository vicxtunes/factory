import type { NextConfig } from "next";

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
      ],
    },
  },
};

export default nextConfig;
