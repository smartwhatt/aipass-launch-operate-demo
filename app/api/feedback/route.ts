import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getViewerFromRequest } from "@/lib/auth/session";
import { HttpError } from "@/lib/auth/guards";
import { getRequestByRequestId, recordFeedback } from "@/lib/telemetry/requests";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

const bodySchema = z.object({
  request_id: z.string().min(1).max(64),
  label: z.enum(["helpful", "needs_correction"]),
  comment: z.string().max(500).optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      throw new HttpError(401, "unauthorized", "ต้องเข้าสู่ระบบก่อนส่งความคิดเห็น", "เข้าสู่ระบบ");
    }

    const body = await parseBody(request, bodySchema);
    const db = getDb();
    const config = getConfig();
    const requestRow = await getRequestByRequestId(db, config.DATA_NAMESPACE, body.request_id);

    if (!requestRow) {
      throw new HttpError(404, "not_found", "ไม่พบคำขอนี้ในระบบ", "ส่งความคิดเห็นจากหน้าคำตอบเดิม");
    }
    if (viewer.role !== "admin" && requestRow.userId !== viewer.id) {
      throw new HttpError(403, "forbidden", "ให้ความคิดเห็นได้เฉพาะคำขอของบัญชีตัวเอง", "ถามคำถามใหม่ด้วยบัญชีนี้");
    }

    const record = await recordFeedback(db, {
      namespace: config.DATA_NAMESPACE,
      requestRowId: requestRow.id,
      userId: viewer.id,
      label: body.label,
      comment: body.comment ?? null,
      dataset: requestRow.dataset,
    });

    return NextResponse.json({ ok: true, feedback_id: record.id }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
