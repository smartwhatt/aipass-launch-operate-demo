import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getViewerFromRequest } from "@/lib/auth/session";
import { HttpError } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/http/api";

/**
 * Authenticated workbook download.
 *
 * The public URL /downloads/<file> is rewritten here by proxy.ts so a static
 * file copy cannot bypass the session and role check. Only the built workbook
 * is served; every other filename is a 404.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const WORKBOOK_FILENAME = "AIPASS_AI_App_Cost_Calculator_v1.xlsx";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ filename: string }> },
) {
  try {
    const viewer = await getViewerFromRequest(request);
    if (!viewer) {
      throw new HttpError(
        401,
        "unauthorized",
        "ต้องเข้าสู่ระบบก่อนดาวน์โหลดไฟล์",
        "เข้าสู่ระบบแล้วเปิดหน้านี้อีกครั้ง",
      );
    }
    if (viewer.role === "outsider") {
      throw new HttpError(
        403,
        "forbidden",
        "บัญชีนี้ไม่มีสิทธิ์ดาวน์โหลดไฟล์",
        "ใช้บัญชีผู้ใช้ทดลองนำร่องหรือผู้ดูแลระบบ",
      );
    }

    const { filename: rawFilename } = await context.params;
    const filename = decodeURIComponent(rawFilename);
    if (filename !== WORKBOOK_FILENAME) {
      throw new HttpError(404, "not_found", "ไม่พบไฟล์นี้", "เปิดหน้าคำนวณเพื่อดาวน์โหลดไฟล์ที่ถูกต้อง");
    }

    const target = path.join(process.cwd(), "public", "downloads", WORKBOOK_FILENAME);
    let bytes: Buffer;
    let size: number;
    try {
      const [contents, info] = await Promise.all([readFile(target), stat(target)]);
      bytes = contents;
      size = info.size;
    } catch {
      return NextResponse.json(
        {
          status: "error",
          error: {
            code: "workbook_missing",
            message: "ยังไม่มีไฟล์เวิร์กบุ๊กในชุดติดตั้งนี้",
            next_action: "ผู้ดูแลระบบต้องรัน npm run calculator:build",
          },
        },
        { status: 503 },
      );
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename="${WORKBOOK_FILENAME}"`,
        "Cache-Control": "private, no-store",
        "X-Checksum-SHA256": sha256,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
