import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
