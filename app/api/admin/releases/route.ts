import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { releases } from "@/lib/db/schema";
import { requireAdminFromRequest } from "@/lib/auth/guards";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

/** POST /api/admin/releases — record an app/config pair that recovers together. */
const bodySchema = z.object({
  app_version: z.string().min(1).max(32),
  config_version: z.string().min(1).max(32),
  environment: z.string().min(1).max(32).optional(),
  document_version: z.string().max(64).nullable().optional(),
  index_version: z.string().max(64).nullable().optional(),
  commit_sha: z.string().max(64).nullable().optional(),
  test_summary: z.record(z.string(), z.unknown()).optional(),
  owner: z.string().max(120).optional(),
  recovery_instructions: z.string().max(1000).optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireAdminFromRequest(request);
    const body = await parseBody(request, bodySchema);
    const [row] = await getDb()
      .insert(releases)
      .values({
        namespace: getConfig().DATA_NAMESPACE,
        environment: body.environment ?? getConfig().APP_ENV,
        appVersion: body.app_version,
        configVersion: body.config_version,
        documentVersion: body.document_version ?? null,
        indexVersion: body.index_version ?? null,
        commitSha: body.commit_sha ?? null,
        testSummary: body.test_summary ?? {},
        owner: body.owner ?? null,
        recoveryInstructions: body.recovery_instructions ?? null,
      })
      .returning({ id: releases.id });

    return NextResponse.json({ ok: true, release_id: row.id }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
