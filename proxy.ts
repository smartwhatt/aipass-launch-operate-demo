import { NextResponse, type NextRequest } from "next/server";

/**
 * Public-path guard for the workbook.
 *
 * Next serves everything in public/ before it reaches an app route, so a file
 * in public/downloads would bypass the authenticated download handler. This
 * proxy runs first and rewrites the public URL to the authenticated route,
 * keeping the required URL while enforcing the session check.
 */
export default function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/downloads/")) {
    const url = request.nextUrl.clone();
    const filename = request.nextUrl.pathname.replace(/^\/downloads\//, "");
    url.pathname = `/api/workbook/${encodeURIComponent(filename)}`;
    url.search = "";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/downloads/:path*"],
};
