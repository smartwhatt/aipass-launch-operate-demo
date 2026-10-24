import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCommitSha, getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requireAdminFromRequest } from "@/lib/auth/guards";
import { EvaluationBlocked, runEvaluation } from "@/lib/evaluation/runner";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

/** POST /api/admin/evaluations/run — run the ten cases and persist the run. */
const bodySchema = z.object({
  mode: z.enum(["fixture", "live"]).optional(),
  suite: z.string().max(64).optional(),
  target: z.enum(["docs-v1", "docs-v2"]).optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    await requireAdminFromRequest(request);
    const body = await parseBody(request, bodySchema);
    const config = getConfig();

    const summary = await runEvaluation(getDb(), {
      namespace: config.DATA_NAMESPACE,
      suite: body.suite,
      mode: body.mode ?? "fixture",
      targetDocument: body.target,
      appVersion: config.APP_VERSION,
      commitSha: getCommitSha(),
      apiKey: config.GEMINI_API_KEY,
      modelId: config.GEMINI_MODEL,
    });

    return NextResponse.json(summary, { headers: PRIVATE_HEADERS });
  } catch (error) {
    if (error instanceof EvaluationBlocked) {
      return NextResponse.json(
        {
          status: "provider_unavailable",
          error: {
            code: "evaluation_blocked",
            message: error.reason,
            next_action: "แก้เงื่อนไขที่บล็อกก่อน แล้วรันใหม่ (ยังไม่ถือว่าผ่าน)",
          },
        },
        { status: 409, headers: PRIVATE_HEADERS },
      );
    }
    return errorResponse(error);
  }
}
