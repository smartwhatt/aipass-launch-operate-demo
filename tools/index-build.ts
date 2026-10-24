/**
 * Purpose: build an immutable document index from canonical handbook text.
 *
 * Usage: npm run index:build -- --docs docs-v2 --index index-v2
 *
 * Building never activates: the pointer moves only with index:activate or the
 * admin screen. An existing index key is never rewritten.
 */
import { loadScriptEnv } from "@/lib/scripts/env";

loadScriptEnv();

import { getConfig } from "@/lib/config";
import { getDb, closeDb } from "@/lib/db/client";
import { ensureIndex } from "@/lib/seed/documents";
import { DOCUMENT_KEYS, getCanonicalDocument } from "@/lib/retrieval/canonical";
import { buildIndex } from "@/lib/retrieval/index-build";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const docs = argument("docs");
  const indexKey = argument("index");
  const config = getConfig();

  if (!docs || !indexKey) {
    console.error(`Usage: npm run index:build -- --docs <${DOCUMENT_KEYS.join("|")}> --index <index-key>`);
    process.exitCode = 2;
    return;
  }

  console.log(`environment: ${config.APP_ENV}`);
  console.log(`namespace:   ${config.DATA_NAMESPACE}`);
  console.log(`build:       ${indexKey} from ${docs}`);

  const canonical = getCanonicalDocument(docs);
  const preview = buildIndex(canonical);
  console.log(`sections:    ${preview.entries.sections.length}`);
  console.log(`hash:        ${preview.contentHash}`);

  const result = await ensureIndex(getDb(), config.DATA_NAMESPACE, docs, indexKey);
  console.log(
    result.created
      ? `built ${indexKey} (immutable) from ${docs}`
      : `${indexKey} already exists (immutable) — not modified`,
  );
  console.log("the active pointer did not change; run index:activate to switch");
}

main()
  .catch((error) => {
    console.error(`index:build failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
