import { NextResponse } from "next/server";
import { getCommitSha, getConfig, environmentLabel } from "@/lib/config";
import { pingDatabase } from "@/lib/db/client";
import { getActiveContext } from "@/lib/state/active";
import { getDb } from "@/lib/db/client";
import { PROMPT_VERSION } from "@/lib/providers/prompt";

/**
 * GET /api/health
 *
 * Readiness and a safe version identifier only. No secrets, no connection
 * strings, no raw database errors.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getConfig();
  const database = await pingDatabase();

  let activeIndex: string | null = null;
  let ready = database;
  if (database) {
    try {
      const active = await getActiveContext(getDb(), config.DATA_NAMESPACE);
      activeIndex = active.index?.indexKey ?? null;
      ready = Boolean(activeIndex);
    } catch {
      ready = false;
    }
  }

  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      ready,
      app_version: config.APP_VERSION,
      commit: getCommitSha(),
      environment: config.APP_ENV,
      environment_label: environmentLabel(),
      namespace: config.DATA_NAMESPACE,
      ai_mode: config.AI_MODE,
      prompt_version: PROMPT_VERSION,
      checks: {
        database,
        active_index: activeIndex,
      },
    },
    { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
