import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // plotly.js ships a large UMD bundle; keep it out of the server graph.
  serverExternalPackages: ["xlsx"],
  // Surfaced in the footer so a deployed page can be matched to a commit.
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
};

export default nextConfig;
