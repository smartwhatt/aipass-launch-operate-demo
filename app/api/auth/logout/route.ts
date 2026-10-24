import { NextResponse, type NextRequest } from "next/server";
import { clearedCookieOptions, getViewerFromRequest, revokeSession } from "@/lib/auth/session";
import { errorResponse, PRIVATE_HEADERS } from "@/lib/http/api";

export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewerFromRequest(request);
    if (viewer) await revokeSession(viewer.sessionId);
    const response = NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
    response.cookies.set({ ...clearedCookieOptions(), value: "" });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
