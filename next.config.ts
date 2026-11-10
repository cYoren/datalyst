import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the same Wi-Fi or tailnet load the dev server (npm run dev:preview).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '100.*.*.*', '*.local'],
  // Prisma ships a workerd build; bundling it would hide that build from Cloudflare.
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  // pg only requires pg-cloudflare on Workers, so the file tracer misses it.
  outputFileTracingIncludes: { '/**': ['./node_modules/pg-cloudflare/dist/**'] },
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
  // www is canonical (src/lib/brand.ts); Vercel did this at the domain level.
  async redirects() {
    return [{
      source: '/:path*',
      has: [{ type: 'host', value: 'datalyst.one' }],
      destination: 'https://www.datalyst.one/:path*',
      permanent: true,
    }];
  },
  // Remove console.logs in production for smaller bundle
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};

export default nextConfig;
