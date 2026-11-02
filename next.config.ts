import type { NextConfig } from "next";

import { DEV_LAN_HTTPS_HOST } from "./src/lib/dev-lan-https";

const nextConfig: NextConfig = {
  // Локальный прототип с client-side localStorage — без Cache Components,
  // чтобы гидратация Context/useEffect работала стабильно.
  // 192.168.1.116 — только hostname HTTPS sidecar лаборатории (порт 43128).
  allowedDevOrigins: ["127.0.0.1", "localhost", DEV_LAN_HTTPS_HOST],
  serverExternalPackages: ["livekit-server-sdk"],
  transpilePackages: ["@livekit/track-processors", "@mediapipe/tasks-vision"],
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
