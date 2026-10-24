import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { contactRequests } from "@/lib/db/schema";
import { getViewerFromRequest } from "@/lib/auth/session";
import { HttpError } from "@/lib/auth/guards";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

/**
 * POST /api/contact
 *
 * Section 3.2's internal meeting-room request form. Fictional fields only:
 * a display name, a date, a head count, and a note. No real personal data.
 */

const bodySchema = z.object({
  display_name: z.string().trim().min(1).max(80),
  access_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  attendees: z.number().int().min(1).max(50).optional(),
  note: z.string().max(500).optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      throw new HttpError(401, "unauthorized", "ต้องเข้าสู่ระบบก่อนส่งคำขอ", "เข้าสู่ระบบ");
    }

    const body = await parseBody(request, bodySchema);
    const reference = `RM-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    await getDb().insert(contactRequests).values({
      namespace: getConfig().DATA_NAMESPACE,
      reference,
      displayName: body.display_name,
      accessDate: body.access_date ?? null,
      attendees: body.attendees ?? null,
      note: body.note ?? null,
      fictional: true,
    });

    return NextResponse.json(
      {
        ok: true,
        reference,
        message:
          "บันทึกคำขอสมมติแล้ว เจ้าหน้าที่ศูนย์ (สมมติ) จะตอบกลับผ่านช่องทางในแอป ไม่มีการส่งอีเมลจริง",
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
