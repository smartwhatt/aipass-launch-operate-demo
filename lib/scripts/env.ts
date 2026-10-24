/**
 * Purpose: read .env.local (then .env) for command-line tools.
 * Next.js loads these files by itself; scripts do not, so they call this first.
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";

let loaded = false;

function load(): void {
  const root = process.cwd();
  // dotenv never overrides an existing variable, so a real environment (CI,
  // Vercel) wins over the files. .env.local is read before .env.
  loadEnv({ path: path.join(root, ".env.local"), quiet: true });
  loadEnv({ path: path.join(root, ".env"), quiet: true });
  loaded = true;
}

export function loadScriptEnv(): void {
  if (loaded) return;
  load();
}

/** After writing .env.local, re-read it in the same process. */
export function reloadScriptEnv(): void {
  loaded = false;
  load();
}
