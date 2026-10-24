import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
