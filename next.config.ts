import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the same Wi-Fi or tailnet load the dev server (npm run dev:preview).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '100.*.*.*', '*.local'],
  // // output: "export",  // Disabled for Vercel (incompatible with API routes)  // Disabled for Vercel deployment (incompatible with API routes)
  // // distDir: "dist",
  // Optimize heavy package imports for better tree-shaking
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
    // Use modern image formats for better compression
    formats: ['image/avif', 'image/webp'],
  },
  // Remove console.logs in production for smaller bundle
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};

export default nextConfig;
