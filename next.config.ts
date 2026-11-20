import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stamped at build time, so on Vercel it is the deploy time. The site guide
  // birds mention it now and then (src/lib/guide/quips.ts).
  env: {
    SITE_LAST_UPDATED: new Date().toISOString(),
  },
  async redirects() {
    return [
      {
        source: "/projects/urban-gpt",
        destination: "/projects/datum",
        permanent: true,
      },
    ];
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  turbopack: {
    resolveAlias: {
      '@mediapipe/selfie_segmentation': './src/lib/mediapipe-stub.js',
    },
  },
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
