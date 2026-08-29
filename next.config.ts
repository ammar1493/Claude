import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // plotly.js ships a large UMD bundle; keep it out of the server graph.
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
