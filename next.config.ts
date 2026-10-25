import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // People type both names in local development. Next 16 blocks dev assets for
  // a host that differs from the one the server started with.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // The course screen recordings use the dev server; keep the route indicator
  // out of the frame.
  devIndicators: false,
  serverExternalPackages: ["postgres", "exceljs"],
  // The workbook is read from disk at request time by the authenticated route.
  outputFileTracingIncludes: {
    "/api/workbook/[filename]": ["./public/downloads/**"],
  },
  experimental: {
    // Route handlers and server components read PostgreSQL directly.
    // Keep the bundle free of the driver's native/optional pieces.
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
