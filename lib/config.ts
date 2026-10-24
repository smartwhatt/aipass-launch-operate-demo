import { z } from "zod";

/**
 * Server configuration. Secrets are read only here and never exposed to the
 * browser. Nothing in this module is imported by a client component.
 */

const envSchema = z.object({
  APP_ENV: z.enum(["local", "preview", "production"]).default("local"),
  DATA_NAMESPACE: z.string().min(1).default("aipass-local"),
  DATABASE_URL: z.string().default(""),
  SESSION_SECRET: z.string().default(""),
  AI_MODE: z.enum(["fixture", "live"]).default("fixture"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
  LIVE_PRICING_CONFIRMED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DEMO_CONTROLS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DEMO_MODE: z
    .enum(["normal", "stale_index", "incident", "provider_failure"])
    .default("normal"),
  DOCS_VERSION: z.string().default("docs-v1"),
  INDEX_VERSION: z.string().default("index-v1"),
  APP_VERSION: z.string().default("1.0.0"),
  APP_COMMIT: z.string().default(""),
  VERCEL_ENV: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

let cache: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cache) return cache;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server configuration: ${detail}`);
  }
  cache = parsed.data;
  return cache;
}

/** Test helper: forget the cached configuration after changing process.env. */
export function resetConfigCache(): void {
  cache = null;
}

export function getSessionSecret(): string {
  const secret = getConfig().SESSION_SECRET;
  if (secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Run `npm run setup` to generate one (32+ characters).",
    );
  }
  return secret;
}

export function getDatabaseUrl(): string {
  const url = getConfig().DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is empty. Copy .env.example to .env.local and set it.");
  }
  return url;
}

/** Cookie flags: Secure on hosted deployments, plain HTTP allowed on localhost. */
export function secureCookiesEnabled(): boolean {
  return getConfig().APP_ENV !== "local";
}

export function isHostedDeployment(): boolean {
  return getConfig().APP_ENV !== "local";
}

/** Commit shown in the environment strip and on the release record. */
export function getCommitSha(): string {
  const config = getConfig();
  return config.APP_COMMIT || config.VERCEL_GIT_COMMIT_SHA || "unknown";
}

/** Deployment label shown on screen: Local / Preview / Production. */
export function environmentLabel(): "Local" | "Preview" | "Production" {
  switch (getConfig().APP_ENV) {
    case "preview":
      return "Preview";
    case "production":
      return "Production";
    default:
      return "Local";
  }
}

export const TIMEZONE = "Asia/Bangkok";
