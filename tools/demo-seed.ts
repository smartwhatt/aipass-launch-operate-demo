/**
 * Purpose: seed the demo without erasing unrelated data.
 *
 * Usage: npm run demo:seed
 *
 * Creates the three teaching accounts if missing, imports docs-v1, builds the
 * immutable index-v1, activates it only when no index is active, and records a
 * release entry. Use `npm run demo:reset -- --scenario ...` for a full reset.
 */
import { loadScriptEnv } from "@/lib/scripts/env";

loadScriptEnv();

import { getConfig } from "@/lib/config";
import { getDb, closeDb } from "@/lib/db/client";
import { ensureAccounts } from "@/lib/seed/accounts";
import { activateIndex, ensureIndex, getActiveIndexKey } from "@/lib/seed/documents";
import { ensureActiveState } from "@/lib/state/active";
import { releases } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

async function main() {
  const config = getConfig();
  const db = getDb();

  console.log(`environment: ${config.APP_ENV}`);
  console.log(`namespace:   ${config.DATA_NAMESPACE}`);
  console.log(`app version: ${config.APP_VERSION}`);
  console.log(`ai mode:     ${config.AI_MODE}`);

  const accounts = await ensureAccounts(db, config.DATA_NAMESPACE);
  console.log(
    `accounts: ${accounts.filter((account) => account.created).length} created, ${accounts.length} present`,
  );
  if (accounts.some((account) => account.created)) {
    console.log("new account passwords were written by npm run setup; run it if you need them");
  }

  await ensureActiveState(db, config.DATA_NAMESPACE);
  const index = await ensureIndex(db, config.DATA_NAMESPACE, "docs-v1", "index-v1");
  console.log(`documents: docs-v1 imported (${index.chunkCount} section chunks)`);
  console.log(`index: index-v1 ${index.created ? "built" : "already present (immutable)"}`);

  const active = await getActiveIndexKey(db, config.DATA_NAMESPACE);
  if (!active) {
    await activateIndex(db, config.DATA_NAMESPACE, "index-v1");
    console.log("active index: index-v1 (was unset)");
  } else {
    console.log(`active index: ${active} (unchanged)`);
  }

  const [existingRelease] = await db
    .select({ id: releases.id })
    .from(releases)
    .where(
      and(
        eq(releases.namespace, config.DATA_NAMESPACE),
        eq(releases.environment, config.APP_ENV),
        eq(releases.appVersion, config.APP_VERSION),
      ),
    )
    .limit(1);
  if (!existingRelease) {
    await db.insert(releases).values({
      namespace: config.DATA_NAMESPACE,
      environment: config.APP_ENV,
      appVersion: config.APP_VERSION,
      configVersion: "cfg-1",
      documentVersion: "docs-v1",
      indexVersion: "index-v1",
      commitSha: config.APP_COMMIT || "unknown",
      testSummary: { seeded_by: "npm run demo:seed" },
      owner: "ทีมการสอน (สมมติ)",
      recoveryInstructions:
        "ถ้าแอปตอบผิดเพราะดัชนีเก่า ให้สร้างและเปิดใช้ดัชนีใหม่จากหน้า /admin/demo หรือ npm run index:build แล้ว npm run index:activate",
    });
    console.log("release record: added");
  } else {
    console.log("release record: already present");
  }

  console.log("");
  console.log("seed complete. Next: npm run demo:reset -- --scenario ep1-baseline");
}

main()
  .catch((error) => {
    console.error(`demo:seed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
