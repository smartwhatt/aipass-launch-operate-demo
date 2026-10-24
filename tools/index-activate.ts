/**
 * Purpose: move the active index pointer.
 *
 * Usage: npm run index:activate -- --index index-v2
 *
 * The pointer lives in PostgreSQL. A code rollback does not move it back, which
 * is exactly the limitation the EP3 lesson teaches.
 */
import { loadScriptEnv } from "@/lib/scripts/env";

loadScriptEnv();

import { getConfig } from "@/lib/config";
import { getDb, closeDb } from "@/lib/db/client";
import { activateIndex, getActiveIndexKey } from "@/lib/seed/documents";
import { getCanonicalDocument } from "@/lib/retrieval/canonical";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const indexKey = argument("index");
  const config = getConfig();

  if (!indexKey) {
    console.error("Usage: npm run index:activate -- --index <index-key>");
    process.exitCode = 2;
    return;
  }

  console.log(`environment: ${config.APP_ENV}`);
  console.log(`namespace:   ${config.DATA_NAMESPACE}`);

  const before = await getActiveIndexKey(getDb(), config.DATA_NAMESPACE);
  await activateIndex(getDb(), config.DATA_NAMESPACE, indexKey);
  const after = await getActiveIndexKey(getDb(), config.DATA_NAMESPACE);
  console.log(`active index: ${before ?? "(none)"} -> ${after}`);

  if (indexKey.includes("v2")) {
    try {
      getCanonicalDocument("docs-v2");
      console.log("checked: docs-v2 exists in the repository");
    } catch {
      console.log("warning: docs-v2 is not in the repository");
    }
  }
}

main()
  .catch((error) => {
    console.error(`index:activate failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
