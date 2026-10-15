import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Локальный прототип с client-side localStorage — без Cache Components,
  // чтобы гидратация Context/useEffect работала стабильно.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
