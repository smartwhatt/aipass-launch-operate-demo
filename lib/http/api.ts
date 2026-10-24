import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { HttpError } from "@/lib/auth/guards";

/**
 * Shared HTTP helpers.
 *
 * Errors never leak database details or stack traces: the health route and
 * every handler return a safe code, a Thai message, and a next action.
 */

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      {
        status:
          error.status === 401 ? "unauthorized" : error.status === 403 ? "forbidden" : "error",
        error: {
          code: error.code,
          message: error.message,
          next_action: error.nextAction ?? null,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        status: "invalid_input",
        error: {
          code: "invalid_input",
          message: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  console.error("Unhandled API error:", error instanceof Error ? error.message : error);
  return NextResponse.json(
    {
      status: "error",
      error: {
        code: "internal_error",
        message: "ระบบเกิดข้อผิดพลาดภายใน",
        next_action: "ลองใหม่ภายหลัง หรือติดต่อผู้ดูแลระบบ",
      },
    },
    { status: 500 },
  );
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "ไม่พบข้อมูล JSON ในคำขอ", "ส่งข้อมูลเป็น JSON");
  }
  return schema.parse(raw);
}

export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;
