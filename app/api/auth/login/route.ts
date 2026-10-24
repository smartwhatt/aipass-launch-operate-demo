import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema";
import { getConfig } from "@/lib/config";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

const bodySchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, bodySchema);
    const config = getConfig();
    const db = getDb();

    const [user] = await db
      .select()
      .from(appUsers)
      .where(
        and(
          eq(appUsers.namespace, config.DATA_NAMESPACE),
          eq(appUsers.username, body.username.toLowerCase()),
        ),
      )
      .limit(1);

    // Same message and timing shape for unknown users and wrong passwords.
    const valid = user && user.isActive ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !valid) {
      return NextResponse.json(
        {
          status: "unauthorized",
          error: {
            code: "invalid_credentials",
            message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
            next_action: "ตรวจบัญชีจากไฟล์ local-accounts ที่สร้างด้วย npm run setup",
          },
        },
        { status: 401, headers: PRIVATE_HEADERS },
      );
    }

    const { cookieValue, expiresAt } = await createSession(user.id, request.headers.get("user-agent"));
    const response = NextResponse.json(
      {
        user: { username: user.username, displayName: user.displayName, role: user.role },
        environment: config.APP_ENV,
      },
      { headers: PRIVATE_HEADERS },
    );
    response.cookies.set({ ...sessionCookieOptions(expiresAt), value: cookieValue });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
