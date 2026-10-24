import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requireDemoControlsFromRequest } from "@/lib/auth/guards";
import { SCENARIO_IDS, applyScenario } from "@/lib/seed/scenarios";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

/** POST /api/admin/scenarios/reset — apply an idempotent, namespace-scoped reset. */
const bodySchema = z.object({
  scenario: z.enum(SCENARIO_IDS as [string, ...string[]]),
  force: z.boolean().optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const viewer = await requireDemoControlsFromRequest(request);
    const body = await parseBody(request, bodySchema);
    const config = getConfig();

    const result = await applyScenario(getDb(), {
      scenario: body.scenario,
      namespace: config.DATA_NAMESPACE,
      actor: viewer.username,
      appVersion: config.APP_VERSION,
      appEnv: config.APP_ENV,
      controlsEnabled: config.DEMO_CONTROLS_ENABLED,
      force: body.force,
    });

    return NextResponse.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
