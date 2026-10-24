import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { getDb, getSql } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { runMigrations } from "@/lib/db/migrate";
import { applyScenario } from "@/lib/seed/scenarios";
import type { AppRole } from "@/lib/domain/types";

/**
 * Integration test helpers.
 *
 * Each suite starts from an empty database in the aipass-test namespace, so a
 * reset or concurrency test cannot disturb the teaching data.
 */

export const TEST_NAMESPACE = "aipass-test";
export const TEST_PASSWORD = "integration-password-1";

const ALL_TABLES = [
  "app_users",
  "sessions",
  "documents",
  "chunks",
  "doc_indexes",
  "active_state",
  "requests",
  "model_calls",
  "trace_spans",
  "feedback",
  "quota_usage",
  "request_admissions",
  "budget_ledger",
  "budget_reservations",
  "budget_events",
  "incidents",
  "evaluation_runs",
  "evaluation_results",
  "releases",
  "reset_audit",
  "contact_requests",
];

export async function prepareDatabase(): Promise<void> {
  const sql = getSql();
  await runMigrations(sql);
  await sql.unsafe(`truncate table ${ALL_TABLES.join(", ")} restart identity cascade`);
}

export async function createTestUsers(): Promise<Record<AppRole, string>> {
  const db = getDb();
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const rows = await db
    .insert(appUsers)
    .values([
      {
        namespace: TEST_NAMESPACE,
        username: "admin",
        displayName: "ผู้ดูแลระบบทดสอบ",
        role: "admin",
        passwordHash,
      },
      {
        namespace: TEST_NAMESPACE,
        username: "pilot",
        displayName: "ผู้ใช้ทดลองทดสอบ",
        role: "pilot",
        passwordHash,
      },
      {
        namespace: TEST_NAMESPACE,
        username: "outsider",
        displayName: "ผู้ใช้ภายนอกทดสอบ",
        role: "outsider",
        passwordHash,
      },
    ])
    .returning({ id: appUsers.id, role: appUsers.role });

  return {
    admin: rows.find((row) => row.role === "admin")!.id,
    pilot: rows.find((row) => row.role === "pilot")!.id,
    outsider: rows.find((row) => row.role === "outsider")!.id,
  };
}

export async function cookieFor(userId: string): Promise<string> {
  const { cookieValue } = await createSession(userId, "vitest");
  return `aipass_session=${cookieValue}`;
}

export function jsonRequest(
  url: string,
  body: unknown,
  options: { cookie?: string; method?: string } = {},
): NextRequest {
  return new NextRequest(`http://test.local${url}`, {
    method: options.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

export function getRequest(url: string, options: { cookie?: string } = {}): NextRequest {
  return new NextRequest(`http://test.local${url}`, {
    method: "GET",
    headers: options.cookie ? { cookie: options.cookie } : {},
  });
}

export async function seedBaseline(): Promise<void> {
  const config = getConfig();
  await applyScenario(getDb(), {
    scenario: "ep1-baseline",
    namespace: TEST_NAMESPACE,
    actor: "vitest",
    appVersion: config.APP_VERSION,
    appEnv: config.APP_ENV,
    controlsEnabled: true,
  });
}

export async function applyTestScenario(scenario: string): Promise<void> {
  const config = getConfig();
  await applyScenario(getDb(), {
    scenario,
    namespace: TEST_NAMESPACE,
    actor: "vitest",
    appVersion: scenario.startsWith("ep3-fixed") ? "1.0.1" : config.APP_VERSION,
    appEnv: config.APP_ENV,
    controlsEnabled: true,
  });
}

export async function userIdByUsername(username: string): Promise<string> {
  const [row] = await getDb()
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.username, username))
    .limit(1);
  if (!row) throw new Error(`user ${username} not found`);
  return row.id;
}

export function uniqueKey(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
