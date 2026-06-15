import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode for catching side effects in dev
  reactStrictMode: true,

  // Required for Supabase Realtime + SSE streaming
  experimental: {
    // Server Actions are stable in Next.js 15
  },

  // Vercel: don't timeout long-running streaming routes
  // SSE advisor route can stream for up to 30s on hobby plan
  serverExternalPackages: ['@anthropic-ai/sdk'],

  // Allow images from Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
