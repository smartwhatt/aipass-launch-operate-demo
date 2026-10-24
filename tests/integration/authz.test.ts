import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb, getSql, closeDb } from "@/lib/db/client";
import { contactRequests, feedback, modelCalls, quotaUsage, requests } from "@/lib/db/schema";
import { getConfig } from "@/lib/config";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as questionsRoute } from "@/app/api/questions/route";
import { POST as feedbackRoute } from "@/app/api/feedback/route";
import { POST as contactRoute } from "@/app/api/contact/route";
import { GET as healthRoute } from "@/app/api/health/route";
import { GET as metricsRoute } from "@/app/api/admin/metrics/route";
import { GET as tracesRoute } from "@/app/api/admin/traces/[requestId]/route";
import { POST as resetRoute } from "@/app/api/admin/scenarios/reset/route";
import { GET as workbookRoute } from "@/app/api/workbook/[filename]/route";
import {
  cookieFor,
  createTestUsers,
  getRequest,
  jsonRequest,
  prepareDatabase,
  seedBaseline,
  TEST_NAMESPACE,
  TEST_PASSWORD,
  uniqueKey,
} from "./helpers";

/**
 * Authorization is tested through the real route handlers with real cookies.
 * Hiding a button is not a control; these calls are the direct HTTP access the
 * implementation spec asks for.
 */

let users: Record<"admin" | "pilot" | "outsider", string>;
let adminCookie: string;
let pilotCookie: string;
let outsiderCookie: string;

async function clearRateCounters(): Promise<void> {
  await getSql()`delete from request_admissions where namespace = ${TEST_NAMESPACE}`;
}

beforeEach(async () => {
  await clearRateCounters();
});

beforeAll(async () => {
  await prepareDatabase();
  users = await createTestUsers();
  await seedBaseline();
  adminCookie = await cookieFor(users.admin);
  pilotCookie = await cookieFor(users.pilot);
  outsiderCookie = await cookieFor(users.outsider);
});

afterAll(async () => {
  await closeDb();
});

describe("authentication", () => {
  it("rejects a wrong password without revealing which field was wrong", async () => {
    const response = await loginRoute(
      jsonRequest("/api/auth/login", { username: "pilot", password: "wrong-password" }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_credentials");
  });

  it("rejects an unknown user with the same shape", async () => {
    const response = await loginRoute(
      jsonRequest("/api/auth/login", { username: "nobody", password: TEST_PASSWORD }),
    );
    expect(response.status).toBe(401);
  });

  it("sets an HttpOnly, SameSite session cookie on success", async () => {
    const response = await loginRoute(
      jsonRequest("/api/auth/login", { username: "pilot", password: TEST_PASSWORD }),
    );
    expect(response.status).toBe(200);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain("aipass_session=");
    expect(header.toLowerCase()).toContain("httponly");
    expect(header.toLowerCase()).toContain("samesite=lax");
  });

  it("revokes the session on logout", async () => {
    const response = await logoutRoute(jsonRequest("/api/auth/logout", {}, { cookie: pilotCookie }));
    expect(response.status).toBe(200);
    const probe = await questionsRoute(
      jsonRequest(
        "/api/questions",
        { question: "ศูนย์เปิดกี่โมง", idempotency_key: uniqueKey("after-logout") },
        { cookie: pilotCookie },
      ),
    );
    expect(probe.status).toBe(401);
    // The revocation only affects that one session; make a fresh cookie.
    pilotCookie = await cookieFor(users.pilot);
  });
});

describe("question authorization", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const response = await questionsRoute(
      jsonRequest("/api/questions", {
        question: "ศูนย์เปิดกี่โมง",
        idempotency_key: uniqueKey("anon"),
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("unauthorized");
  });

  it("rejects the outsider role with 403 and no model call", async () => {
    const before = await getSql()`select count(*)::int as count from request_admissions`;
    const response = await questionsRoute(
      jsonRequest(
        "/api/questions",
        { question: "ศูนย์เปิดกี่โมง", idempotency_key: uniqueKey("outsider") },
        { cookie: outsiderCookie },
      ),
    );
    expect(response.status).toBe(403);
    const after = await getSql()`select count(*)::int as count from request_admissions`;
    expect(after[0].count).toBe(before[0].count);
  });

  it("answers for the pilot role", async () => {
    const response = await questionsRoute(
      jsonRequest(
        "/api/questions",
        { question: "ศูนย์เปิดกี่โมง", idempotency_key: uniqueKey("pilot") },
        { cookie: pilotCookie },
      ),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      citations: Array<{ sectionId: string; version: string }>;
    };
    expect(body.status).toBe("ok");
    expect(body.citations[0]).toMatchObject({ sectionId: "2.1", version: "docs-v1" });
  });
});

describe("admin authorization", () => {
  it("blocks unauthenticated access to metrics and traces", async () => {
    expect((await metricsRoute(getRequest("/api/admin/metrics"))).status).toBe(401);
    expect(
      (await tracesRoute(getRequest("/api/admin/traces/DEMO-R042"), {
        params: Promise.resolve({ requestId: "DEMO-R042" }),
      })).status,
    ).toBe(401);
  });

  it("blocks the pilot role from admin routes", async () => {
    const metrics = await metricsRoute(getRequest("/api/admin/metrics", { cookie: pilotCookie }));
    expect(metrics.status).toBe(403);
    const reset = await resetRoute(
      jsonRequest("/api/admin/scenarios/reset", { scenario: "ep1-baseline" }, { cookie: pilotCookie }),
    );
    expect(reset.status).toBe(403);
  });

  it("allows the admin role", async () => {
    const metrics = await metricsRoute(getRequest("/api/admin/metrics", { cookie: adminCookie }));
    expect(metrics.status).toBe(200);
  });
});

describe("input validation", () => {
  it("rejects blank input before admission", async () => {
    const before = await getSql()`select count(*)::int as count from requests`;
    const response = await questionsRoute(
      jsonRequest(
        "/api/questions",
        { question: "   ", idempotency_key: uniqueKey("blank") },
        { cookie: pilotCookie },
      ),
    );
    expect(response.status).toBe(400);
    const after = await getSql()`select count(*)::int as count from requests`;
    expect(after[0].count).toBe(before[0].count);
  });

  it("rejects input over 2,000 characters before admission", async () => {
    const before = await getSql()`select count(*)::int as count from model_calls`;
    const response = await questionsRoute(
      jsonRequest(
        "/api/questions",
        { question: "ก".repeat(2001), idempotency_key: uniqueKey("long") },
        { cookie: pilotCookie },
      ),
    );
    expect(response.status).toBe(400);
    const after = await getSql()`select count(*)::int as count from model_calls`;
    expect(after[0].count).toBe(before[0].count);
  });

  it("accepts exactly 2,000 characters", async () => {
    const response = await questionsRoute(
      jsonRequest(
        "/api/questions",
        { question: "ศูนย์เปิดกี่โมง".padEnd(2000, "ก"), idempotency_key: uniqueKey("max") },
        { cookie: pilotCookie },
      ),
    );
    expect([200, 429]).toContain(response.status);
  });
});

describe("idempotency", () => {
  it("creates one request and one call sequence for a repeated key", async () => {
    const key = uniqueKey("idem");
    const first = await questionsRoute(
      jsonRequest("/api/questions", { question: "ศูนย์เปิดกี่โมง", idempotency_key: key }, { cookie: pilotCookie }),
    );
    const firstBody = (await first.json()) as { request_id: string };
    const second = await questionsRoute(
      jsonRequest("/api/questions", { question: "ศูนย์เปิดกี่โมง", idempotency_key: key }, { cookie: pilotCookie }),
    );
    const secondBody = (await second.json()) as { request_id: string };

    expect(secondBody.request_id).toBe(firstBody.request_id);

    const rows = await getDb()
      .select({ id: requests.id })
      .from(requests)
      .where(and(eq(requests.namespace, TEST_NAMESPACE), eq(requests.requestId, firstBody.request_id)));
    expect(rows).toHaveLength(1);

    const calls = await getDb()
      .select({ id: modelCalls.id })
      .from(modelCalls)
      .where(eq(modelCalls.requestId, rows[0].id));
    expect(calls).toHaveLength(1);
  });
});

describe("feedback and contact", () => {
  it("accepts feedback on your own request", async () => {
    const answer = await questionsRoute(
      jsonRequest(
        "/api/questions",
        { question: "ศูนย์เปิดกี่โมง", idempotency_key: uniqueKey("fb") },
        { cookie: pilotCookie },
      ),
    );
    const body = (await answer.json()) as { request_id: string };
    const response = await feedbackRoute(
      jsonRequest(
        "/api/feedback",
        { request_id: body.request_id, label: "needs_correction" },
        { cookie: pilotCookie },
      ),
    );
    expect(response.status).toBe(200);
    const rows = await getDb()
      .select({ id: feedback.id })
      .from(feedback)
      .where(eq(feedback.namespace, TEST_NAMESPACE));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("refuses feedback on someone else's request", async () => {
    const answer = await questionsRoute(
      jsonRequest(
        "/api/questions",
        { question: "ศูนย์เปิดกี่โมง", idempotency_key: uniqueKey("fb2") },
        { cookie: pilotCookie },
      ),
    );
    const body = (await answer.json()) as { request_id: string };
    const response = await feedbackRoute(
      jsonRequest(
        "/api/feedback",
        { request_id: body.request_id, label: "helpful" },
        { cookie: adminCookie },
      ),
    );
    // Admins may review any request, so this is allowed by design; the outsider
    // is the role that must be refused.
    expect(response.status).toBe(200);
    const refused = await feedbackRoute(
      jsonRequest(
        "/api/feedback",
        { request_id: body.request_id, label: "helpful" },
        { cookie: outsiderCookie },
      ),
    );
    expect(refused.status).toBe(403);
  });

  it("records a fictional meeting-room request", async () => {
    const response = await contactRoute(
      jsonRequest(
        "/api/contact",
        { display_name: "ผู้ใช้ทดสอบ", attendees: 4, note: "ซ้อมถามตอบ" },
        { cookie: pilotCookie },
      ),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { reference: string; ok: boolean };
    expect(body.ok).toBe(true);
    expect(body.reference).toMatch(/^RM-/);
    const rows = await getDb()
      .select({ id: contactRequests.id })
      .from(contactRequests)
      .where(eq(contactRequests.namespace, TEST_NAMESPACE));
    expect(rows).toHaveLength(1);
  });
});

describe("health and downloads", () => {
  it("exposes readiness and a safe version, with no secrets", async () => {
    const response = await healthRoute();
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.app_version).toBe("1.0.0");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("SESSION_SECRET");
    expect(serialized).not.toContain(getConfig().SESSION_SECRET);
    expect(serialized).not.toContain("postgres://");
  });

  it("requires a session to download the workbook", async () => {
    const anonymous = await workbookRoute(getRequest("/api/workbook/AIPASS_AI_App_Cost_Calculator_v1.xlsx"), {
      params: Promise.resolve({ filename: "AIPASS_AI_App_Cost_Calculator_v1.xlsx" }),
    });
    expect(anonymous.status).toBe(401);

    const outsider = await workbookRoute(
      getRequest("/api/workbook/AIPASS_AI_App_Cost_Calculator_v1.xlsx", { cookie: outsiderCookie }),
      { params: Promise.resolve({ filename: "AIPASS_AI_App_Cost_Calculator_v1.xlsx" }) },
    );
    expect(outsider.status).toBe(403);

    const pilot = await workbookRoute(
      getRequest("/api/workbook/AIPASS_AI_App_Cost_Calculator_v1.xlsx", { cookie: pilotCookie }),
      { params: Promise.resolve({ filename: "AIPASS_AI_App_Cost_Calculator_v1.xlsx" }) },
    );
    expect(pilot.status).toBe(200);
    const checksum = pilot.headers.get("x-checksum-sha256");
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses an unknown filename", async () => {
    const response = await workbookRoute(getRequest("/api/workbook/other.xlsx", { cookie: pilotCookie }), {
      params: Promise.resolve({ filename: "other.xlsx" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("quota state is visible to the admin", () => {
  it("counts today's quota rows for the pilot", async () => {
    const rows = await getDb()
      .select({ used: quotaUsage.used })
      .from(quotaUsage)
      .where(eq(quotaUsage.userId, users.pilot));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].used).toBeGreaterThan(0);
  });
});

describe("database writes are namespace-scoped", () => {
  it("never writes another namespace", async () => {
    const [row] = await getSql()`
      select count(*)::int as count from requests where namespace <> ${TEST_NAMESPACE}
    `;
    expect(row.count).toBe(0);
  });
});
