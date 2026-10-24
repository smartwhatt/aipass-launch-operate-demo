import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { appUsers, sessions } from "@/lib/db/schema";
import { getSessionSecret, secureCookiesEnabled } from "@/lib/config";
import type { AppRole } from "@/lib/domain/types";

/**
 * Sessions.
 *
 * The cookie carries `<sessionId>.<hmac>`: the signature stops tampering and
 * the PostgreSQL row stops replay after logout or expiry. The cookie is
 * HttpOnly and SameSite=Lax, and Secure on hosted deployments.
 */

export const SESSION_COOKIE = "aipass_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type Viewer = {
  id: string;
  username: string;
  displayName: string;
  role: AppRole;
  sessionId: string;
};

function sign(sessionId: string): string {
  return createHmac("sha256", getSessionSecret()).update(sessionId).digest("base64url");
}

function signatureHash(signature: string): string {
  return createHmac("sha256", getSessionSecret()).update(`sig:${signature}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function createSession(
  userId: string,
  userAgent: string | null,
): Promise<{ cookieValue: string; expiresAt: Date }> {
  const db = getDb();
  const sessionId = randomUUID();
  const signature = sign(sessionId);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    id: sessionId,
    namespace: (await getNamespace()),
    userId,
    tokenHash: signatureHash(signature),
    expiresAt,
    userAgent,
  });

  return { cookieValue: `${sessionId}.${signature}`, expiresAt };
}

let namespaceCache: string | null = null;
async function getNamespace(): Promise<string> {
  if (!namespaceCache) {
    const { getConfig } = await import("@/lib/config");
    namespaceCache = getConfig().DATA_NAMESPACE;
  }
  return namespaceCache;
}

export async function resolveSession(cookieValue: string | undefined): Promise<Viewer | null> {
  if (!cookieValue) return null;
  const separator = cookieValue.lastIndexOf(".");
  if (separator <= 0) return null;

  const sessionId = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  if (!safeEqual(signature, sign(sessionId))) return null;

  const db = getDb();
  const rows = await db
    .select({
      sessionId: sessions.id,
      tokenHash: sessions.tokenHash,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userId: appUsers.id,
      username: appUsers.username,
      displayName: appUsers.displayName,
      role: appUsers.role,
      isActive: appUsers.isActive,
    })
    .from(sessions)
    .innerJoin(appUsers, eq(appUsers.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.tokenHash !== signatureHash(signature)) return null;
  if (!row.isActive) return null;

  return {
    id: row.userId,
    username: row.username,
    displayName: row.displayName,
    role: row.role as AppRole,
    sessionId: row.sessionId,
  };
}

/** Server components and server actions. */
export async function getViewer(): Promise<Viewer | null> {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
}

/** Route handlers. */
export async function getViewerFromRequest(request: NextRequest): Promise<Viewer | null> {
  return resolveSession(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureCookiesEnabled(),
    path: "/",
    expires: expiresAt,
  };
}

export function clearedCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureCookiesEnabled(),
    path: "/",
    maxAge: 0,
  };
}
