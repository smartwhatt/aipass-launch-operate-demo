import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getViewerFromRequest } from "@/lib/auth/session";
import { HttpError } from "@/lib/auth/guards";
import { askQuestion } from "@/lib/answers/ask";
import { validateQuestion } from "@/lib/answers/validation";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

/**
 * POST /api/questions
 *
 * Authorization and validation happen before admission: an outsider, blank
 * input, or oversized input never reaches a provider and never uses quota.
 */

const bodySchema = z.object({
  question: z.string(),
  idempotency_key: z.string().min(8).max(128),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      throw new HttpError(401, "unauthorized", "ต้องเข้าสู่ระบบก่อนถามคำถาม", "เข้าสู่ระบบด้วยบัญชีที่ได้รับ");
    }
    if (viewer.role !== "pilot" && viewer.role !== "admin") {
      throw new HttpError(
        403,
        "forbidden",
        "บัญชีนี้ไม่มีสิทธิ์ถามคำถามจากคู่มือ",
        "ใช้บัญชีผู้ใช้ทดลองนำร่อง หรือติดต่อผู้ดูแลระบบ",
      );
    }

    const body = await parseBody(request, bodySchema);
    const validation = validateQuestion(body.question);
    if (!validation.ok) {
      throw new HttpError(
        400,
        validation.code,
        validation.message,
        validation.code === "empty_question"
          ? "พิมพ์คำถาม 1–2,000 ตัวอักษร"
          : "ย่อคำถามให้สั้นลงแล้วส่งใหม่",
      );
    }

    const result = await askQuestion({
      namespace: getConfig().DATA_NAMESPACE,
      viewer,
      question: validation.question,
      idempotencyKey: body.idempotency_key,
    });

    if (result.kind === "in_progress") {
      return NextResponse.json(
        {
          status: "in_progress",
          request_id: result.requestId,
          error: {
            code: "in_progress",
            message: "คำขอนี้กำลังประมวลผลอยู่",
            next_action: "รอสักครู่แล้วตรวจผลจากหมายเลขคำขอเดิม",
          },
        },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }

    const response = NextResponse.json(result.response, { headers: PRIVATE_HEADERS });
    if (result.response.retry_at) {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(result.response.retry_at).getTime() - Date.now()) / 1000),
      );
      response.headers.set("Retry-After", String(seconds));
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
