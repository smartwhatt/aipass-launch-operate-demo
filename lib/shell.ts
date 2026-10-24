import { getConfig } from "@/lib/config";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { getActiveContext, type ActiveContext } from "@/lib/state/active";
import { getDb } from "@/lib/db/client";

/**
 * Per-request shell data for the layout: who is viewing, and which handbook and
 * index this deployment actually serves.
 */
export type Shell = {
  viewer: Viewer | null;
  config: ReturnType<typeof getConfig>;
  active: ActiveContext | null;
};

export async function getShell(): Promise<Shell> {
  const config = getConfig();
  const viewer = await getViewer();

  let active: ActiveContext | null = null;
  try {
    active = await getActiveContext(getDb(), config.DATA_NAMESPACE);
  } catch {
    active = null;
  }

  return { viewer, config, active };
}
