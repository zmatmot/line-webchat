import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is left off: every API route here is request-time only
  // and declares that with `export const dynamic = "force-dynamic"`, a route
  // segment config that Cache Components removes.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
