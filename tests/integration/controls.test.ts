import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb, getSql } from "@/lib/db/client";
import { budgetLedger, modelCalls, quotaUsage, requests } from "@/lib/db/schema";
import { POST as questionsRoute } from "@/app/api/questions/route";
import { GET as metricsRoute } from "@/app/api/admin/metrics/route";
import { GET as tracesRoute } from "@/app/api/admin/traces/[requestId]/route";
import { POST as registerDocumentRoute } from "@/app/api/admin/documents/register/route";
import { POST as buildIndexRoute } from "@/app/api/admin/indexes/build/route";
import { POST as activateIndexRoute } from "@/app/api/admin/indexes/activate/route";
import {
  applyTestScenario,
  cookieFor,
  createTestUsers,
  getRequest,
  jsonRequest,
  prepareDatabase,
  seedBaseline,
  TEST_NAMESPACE,
  uniqueKey,
} from "./helpers";
import { bangkokDate, bangkokPeriod, nextQuotaResetAt } from "@/lib/controls/limits";
import { applyScenario, ScenarioError } from "@/lib/seed/scenarios";
import { getConfig } from "@/lib/config";

/**
 * Persistent controls and the historical dataset.
 *
 * Parallel requests are real: they are admitted through the same transaction,
 * against the same PostgreSQL rows, from more than one connection.
 */

let users: Record<"admin" | "pilot" | "outsider", string>;
let adminCookie: string;
let pilotCookie: string;

const namespace = TEST_NAMESPACE;

async function clearRateCounters(): Promise<void> {
  await getSql()`delete from request_admissions where namespace = ${namespace}`;
}

async function ask(question: string, cookie = pilotCookie, key = uniqueKey("q")) {
  const response = await questionsRoute(
    jsonRequest("/api/questions", { question, idempotency_key: key }, { cookie }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  await prepareDatabase();
  users = await createTestUsers();
  await seedBaseline();
  adminCookie = await cookieFor(users.admin);
  pilotCookie = await cookieFor(users.pilot);
});

beforeEach(async () => {
  await clearRateCounters();
});

afterAll(async () => {
  await closeDb();
});

describe("rate limit", () => {
  it("admits five questions in a rolling 60 seconds and rejects the sixth", async () => {
    await applyTestScenario("ep1-baseline");
    const results = [];
    for (let index = 0; index < 6; index += 1) {
      results.push(await ask("ศูนย์เปิดกี่โมง"));
    }
    expect(results.slice(0, 5).every((result) => result.body.status === "ok")).toBe(true);
    expect(results[5].body.status).toBe("rate_limited");
    expect(typeof results[5].body.retry_at).toBe("string");
    const retryAt = new Date(results[5].body.retry_at as string).getTime();
    expect(retryAt - Date.now()).toBeGreaterThan(0);
    expect(retryAt - Date.now()).toBeLessThanOrEqual(61_000);
  });
});

describe("daily quota", () => {
  it("cannot spend the last slot twice under parallel requests", async () => {
    await applyTestScenario("ep2-quota"); // sets the pilot to 19/20, clears rate
    const before = await countRequests();

    const [first, second] = await Promise.all([
      ask("ศูนย์เปิดกี่โมง", pilotCookie, uniqueKey("race-a")),
      ask("ศูนย์เปิดกี่โมง", pilotCookie, uniqueKey("race-b")),
    ]);

    const statuses = [first.body.status, second.body.status].sort();
    expect(statuses).toEqual(["ok", "quota_exceeded"]);

    const after = await countRequests();
    expect(after).toBe(before + 1);

    const [quota] = await getDb()
      .select({ used: quotaUsage.used })
      .from(quotaUsage)
      .where(
        and(
          eq(quotaUsage.namespace, namespace),
          eq(quotaUsage.userId, users.pilot),
          eq(quotaUsage.usageDate, bangkokDate()),
        ),
      );
    expect(quota.used).toBe(20);

    const rejected = first.body.status === "quota_exceeded" ? first : second;
    expect(new Date(rejected.body.retry_at as string).toISOString()).toBe(
      nextQuotaResetAt().toISOString(),
    );
  });
});

describe("budget reservation", () => {
  it("does not let parallel requests reserve more than the remaining budget", async () => {
    await applyTestScenario("ep1-baseline");
    const period = bangkokPeriod();
    await getDb()
      .update(budgetLedger)
      .set({ committedThb: "999.72", reservedThb: "0", alerted80At: new Date() })
      .where(and(eq(budgetLedger.namespace, namespace), eq(budgetLedger.period, period)));
    await clearRateCounters();

    const before = await countRequests();
    const [first, second] = await Promise.all([
      ask("ศูนย์เปิดกี่โมง", pilotCookie, uniqueKey("budget-a")),
      ask("ศูนย์เปิดกี่โมง", pilotCookie, uniqueKey("budget-b")),
    ]);

    const statuses = [first.body.status, second.body.status].sort();
    expect(statuses).toEqual(["budget_exceeded", "ok"]);
    expect(await countRequests()).toBe(before + 1);

    const [ledger] = await getDb()
      .select()
      .from(budgetLedger)
      .where(and(eq(budgetLedger.namespace, namespace), eq(budgetLedger.period, period)));
    // One admitted call at THB 0.14, no reservation left behind.
    expect(Number(ledger.reservedThb)).toBeCloseTo(0, 4);
    expect(Number(ledger.committedThb)).toBeCloseTo(999.86, 2);
  });

  it("releases the reservation when the provider never answers", async () => {
    await applyTestScenario("ep2-provider-failure");
    await clearRateCounters();
    const result = await ask("ศูนย์เปิดกี่โมง");
    expect(result.body.status).toBe("provider_unavailable");

    const [ledger] = await getDb()
      .select()
      .from(budgetLedger)
      .where(and(eq(budgetLedger.namespace, namespace), eq(budgetLedger.period, bangkokPeriod())));
    expect(Number(ledger.reservedThb)).toBeCloseTo(0, 4);
    expect(Number(ledger.committedThb)).toBeCloseTo(0, 4);

    const [request] = await getDb()
      .select({ id: requests.id })
      .from(requests)
      .where(eq(requests.requestId, result.body.request_id as string));
    const calls = await getDb()
      .select({ id: modelCalls.id, status: modelCalls.status })
      .from(modelCalls)
      .where(eq(modelCalls.requestId, request.id));
    expect(calls).toHaveLength(2); // one initial call plus one retry
    expect(calls.every((call) => call.status === "error")).toBe(true);
  });
});

describe("historical dashboard", () => {
  it("reports exactly 200 requests, p95 9s, and THB 28.84", async () => {
    await applyTestScenario("ep3-stale-index");
    const response = await metricsRoute(
      getRequest("/api/admin/metrics?dataset=historical-pilot", { cookie: adminCookie }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      service: Record<string, number | string>;
      quality: Record<string, number>;
    };
    expect(body.service.requests).toBe(200);
    expect(body.service.errors).toBe(6);
    expect(body.service.insufficientInfo).toBe(40);
    expect(body.service.p95Ms).toBe(9000);
    expect(body.service.p95Method).toBe("nearest-rank");
    expect(body.service.costFixtureThb).toBe(28.84);
    expect(body.service.modelCalls).toBe(206);
    expect(body.quality.feedbackCount).toBe(24);
    expect(body.quality.needsCorrection).toBe(8);
  });

  it("does not move when a rehearsal request arrives", async () => {
    await applyTestScenario("ep3-stale-index");
    await clearRateCounters();
    const answer = await ask("ศูนย์เปิดกี่โมง");
    expect(answer.body.status).toBe("ok");

    const historical = await metricsRoute(
      getRequest("/api/admin/metrics?dataset=historical-pilot", { cookie: adminCookie }),
    );
    const historicalBody = (await historical.json()) as { service: { requests: number; costFixtureThb: number } };
    expect(historicalBody.service.requests).toBe(200);
    expect(historicalBody.service.costFixtureThb).toBe(28.84);

    const live = await metricsRoute(
      getRequest("/api/admin/metrics?dataset=live&from=2026-10-01&to=2026-12-31", {
        cookie: adminCookie,
      }),
    );
    const liveBody = (await live.json()) as { service: { requests: number } };
    expect(liveBody.service.requests).toBeGreaterThanOrEqual(1);
  });

  it("keeps DEMO-R042 as recorded, even after the index is fixed", async () => {
    await applyTestScenario("ep3-stale-index");
    const response = await tracesRoute(
      getRequest("/api/admin/traces/DEMO-R042", { cookie: adminCookie }),
      { params: Promise.resolve({ requestId: "DEMO-R042" }) },
    );
    expect(response.status).toBe(200);
    const trace = (await response.json()) as {
      request: {
        appVersion: string;
        promptVersion: string;
        documentVersion: string;
        indexVersion: string;
        answer: string;
        citations: Array<{ sectionId: string; version: string }>;
      };
    };
    expect(trace.request.appVersion).toBe("1.0.0");
    expect(trace.request.promptVersion).toBe("prompt-1");
    expect(trace.request.documentVersion).toBe("docs-v1");
    expect(trace.request.indexVersion).toBe("index-v1");
    expect(trace.request.answer).toContain("09:00–16:00");
    expect(trace.request.citations[0]).toMatchObject({ sectionId: "2.1", version: "docs-v1" });
  });
});

describe("stale index to corrected index", () => {
  it("changes new answers but not the recorded trace", async () => {
    await applyTestScenario("ep3-stale-index");
    await clearRateCounters();

    const before = await ask("ศูนย์เปิดกี่โมง");
    expect(before.body.answer as string).toContain("09:00–16:00");

    // Register docs-v2: the active index must not move by itself.
    const register = await registerDocumentRoute(
      jsonRequest("/api/admin/documents/register", { document: "docs-v2" }, { cookie: adminCookie }),
    );
    expect(register.status).toBe(200);

    const stillStale = await ask("ศูนย์เปิดกี่โมง");
    expect(stillStale.body.answer as string).toContain("09:00–16:00");

    // Build and activate index-v2.
    const build = await buildIndexRoute(
      jsonRequest(
        "/api/admin/indexes/build",
        { docs: "docs-v2", index: "index-v2" },
        { cookie: adminCookie },
      ),
    );
    expect(build.status).toBe(200);
    const activate = await activateIndexRoute(
      jsonRequest("/api/admin/indexes/activate", { index: "index-v2" }, { cookie: adminCookie }),
    );
    expect(activate.status).toBe(200);

    await clearRateCounters();
    const after = await ask("ศูนย์เปิดกี่โมง");
    expect(after.body.answer as string).toContain("08:30–16:30");
    expect((after.body.citations as Array<{ version: string }>)[0].version).toBe("docs-v2");

    const trace = await tracesRoute(
      getRequest("/api/admin/traces/DEMO-R042", { cookie: adminCookie }),
      { params: Promise.resolve({ requestId: "DEMO-R042" }) },
    );
    const traceBody = (await trace.json()) as { request: { answer: string } };
    expect(traceBody.request.answer).toContain("09:00–16:00");
  });
});

describe("scenario resets", () => {
  it("are idempotent and keep one copy of the historical dataset", async () => {
    const first = await applyTestScenario("ep3-stale-index");
    void first;
    const countAfterFirst = await countHistorical();
    await applyTestScenario("ep3-stale-index");
    expect(await countHistorical()).toBe(countAfterFirst);
    expect(await countHistorical()).toBe(200);
  });

  it("scope data to the namespace and refuse a learner deployment", async () => {
    const config = getConfig();
    await expect(
      applyScenario(getDb(), {
        scenario: "ep1-baseline",
        namespace,
        actor: "vitest",
        appVersion: config.APP_VERSION,
        appEnv: config.APP_ENV,
        controlsEnabled: false,
      }),
    ).rejects.toBeInstanceOf(ScenarioError);

    const [other] = await getSql()`
      select count(*)::int as count from requests where namespace <> ${namespace}
    `;
    expect(other.count).toBe(0);
  });

  it("restores the EP1 baseline: docs-v1 only, normal mode, no incident", async () => {
    await applyTestScenario("ep1-baseline");
    const [state] = await getSql()`
      select active_index_key, mode, incident_enabled from active_state where namespace = ${namespace}
    `;
    expect(state.active_index_key).toBe("index-v1");
    expect(state.mode).toBe("normal");
    expect(state.incident_enabled).toBe(false);
    const [docCount] = await getSql()`
      select count(*)::int as count from documents where namespace = ${namespace}
    `;
    expect(docCount.count).toBe(1);
    const [historical] = await getSql()`
      select count(*)::int as count from requests where namespace = ${namespace} and dataset = 'historical-pilot'
    `;
    expect(historical.count).toBe(0);
  });
});

async function countRequests(): Promise<number> {
  const [row] = await getSql()`
    select count(*)::int as count from requests where namespace = ${namespace} and dataset = 'live'
  `;
  return row.count;
}

async function countHistorical(): Promise<number> {
  const [row] = await getSql()`
    select count(*)::int as count from requests where namespace = ${namespace} and dataset = 'historical-pilot'
  `;
  return row.count;
}
