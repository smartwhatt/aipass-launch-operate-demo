import path from "node:path";

/**
 * Test environment.
 *
 * Integration tests use a separate database. Set TEST_DATABASE_URL to override;
 * the default matches the local cluster from `npm run db:local:start`.
 */
process.env.APP_ENV = "local";
process.env.DATA_NAMESPACE = "aipass-test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/aipass_test";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-secret-0123456789abcdef0123456789abcdef";
process.env.AI_MODE = "fixture";
process.env.GEMINI_API_KEY = "";
process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
process.env.LIVE_PRICING_CONFIRMED = "false";
process.env.DEMO_CONTROLS_ENABLED = "true";
process.env.DEMO_MODE = "normal";
process.env.DOCS_VERSION = "docs-v1";
process.env.INDEX_VERSION = "index-v1";
process.env.APP_VERSION = "1.0.0";
process.env.APP_COMMIT = "test-commit";

// Keep test artifacts inside the repository.
process.env.TMPDIR = path.join(process.cwd(), "artifacts", "tmp");
