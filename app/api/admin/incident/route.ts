import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { activeState, incidents } from "@/lib/db/schema";
import { requireDemoControlsFromRequest } from "@/lib/auth/guards";
import { bumpConfigVersion, ensureActiveState } from "@/lib/state/active";
import { errorResponse, parseBody, PRIVATE_HEADERS } from "@/lib/http/api";

/** POST /api/admin/incident — show, update, or clear the incident banner. */
const bodySchema = z.object({
  enabled: z.boolean(),
  topic: z.string().max(64).nullable().optional(),
  message: z.string().max(500).nullable().optional(),
  owner: z.string().max(120).nullable().optional(),
  next_update: z.string().datetime().nullable().optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const viewer = await requireDemoControlsFromRequest(request);
    const body = await parseBody(request, bodySchema);
    const db = getDb();
    const namespace = getConfig().DATA_NAMESPACE;
    await ensureActiveState(db, namespace);

    const nextUpdate = body.next_update
      ? new Date(body.next_update)
      : body.enabled
        ? new Date(Date.now() + 2 * 60 * 60 * 1000)
        : null;
    await db
      .update(activeState)
      .set({
        incidentEnabled: body.enabled,
        incidentTopic: body.enabled ? (body.topic ?? "opening_hours") : null,
        incidentMessage: body.enabled ? (body.message ?? null) : null,
        incidentOwner: body.enabled ? (body.owner ?? null) : null,
        incidentNextUpdate: body.enabled ? nextUpdate : null,
        updatedAt: new Date(),
      })
      .where(eq(activeState.namespace, namespace));

    await db.insert(incidents).values({
      namespace,
      enabled: body.enabled,
      topic: body.enabled ? (body.topic ?? "opening_hours") : null,
      message: body.enabled ? (body.message ?? null) : null,
      owner: body.enabled ? (body.owner ?? null) : null,
      nextUpdateAt: body.enabled ? nextUpdate : null,
      createdBy: viewer.id,
    });

    const configVersion = await bumpConfigVersion(db, namespace);
    return NextResponse.json(
      { ok: true, enabled: body.enabled, config_version: configVersion },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
