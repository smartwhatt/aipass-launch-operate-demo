import { and, eq, sql } from "drizzle-orm";
import type { Database, DbLike } from "@/lib/db/client";
import {
  activeState,
  appUsers,
  budgetEvents,
  budgetLedger,
  budgetReservations,
  incidents,
  quotaUsage,
  releases,
  requestAdmissions,
  requests,
  resetAudit,
} from "@/lib/db/schema";
import scenariosFixture from "@/fixtures/scenarios.json";
import {
  bangkokDate,
  bangkokPeriod,
  DAILY_QUOTA,
  DEFAULT_BUDGET_LIMIT_THB,
  nextQuotaResetAt,
} from "@/lib/controls/limits";
import { ensureActiveState, bumpConfigVersion } from "@/lib/state/active";
import {
  activateIndex,
  ensureDocument,
  ensureIndex,
  getActiveIndexKey,
  removeDocuments,
} from "@/lib/seed/documents";
import { clearHistoricalDataset, loadHistoricalDataset, verifyHistoricalDataset } from "@/lib/seed/historical";
import type { ScenarioMode } from "@/lib/domain/types";

/**
 * Named scenario resets (spec section 10).
 *
 * Every reset is idempotent and namespace-scoped. It changes teaching data and
 * controls only: never the executable app version, never the commit. A reset
 * writes an audit row outside the reset dataset so history survives itself.
 */

export type ScenarioDefinition = {
  id: string;
  required_app_version: string;
  latest_document?: string;
  active_index: string;
  mode: string;
  spent_thb?: number;
  used_questions_today?: number;
  environment?: string;
  pause_topic?: string;
};

/**
 * Some scenarios in fixtures/scenarios.json state only what they change. A
 * missing index or document means "keep the baseline one".
 */
function normalize(entry: ScenarioDefinition): ScenarioDefinition {
  return {
    ...entry,
    latest_document: entry.latest_document ?? "docs-v1",
    active_index: entry.active_index ?? "index-v1",
  };
}

export type NormalizedScenario = ScenarioDefinition & {
  latest_document: string;
  active_index: string;
};

export const SCENARIOS: NormalizedScenario[] = (
  scenariosFixture.scenarios as ScenarioDefinition[]
).map((entry) => normalize(entry) as NormalizedScenario);
export const COMMON = scenariosFixture.common;

export const SCENARIO_IDS = SCENARIOS.map((scenario) => scenario.id);

export class ScenarioError extends Error {}

export function getScenario(id: string): NormalizedScenario {
  const scenario = SCENARIOS.find((entry) => entry.id === id);
  if (!scenario) {
    throw new ScenarioError(`Unknown scenario ${id}. Known: ${SCENARIO_IDS.join(", ")}`);
  }
  return normalize(scenario) as NormalizedScenario;
}

export type ResetResult = {
  scenario: string;
  namespace: string;
  actor: string;
  applied: boolean;
  actions: string[];
  warnings: string[];
  activeIndex: string | null;
  mode: string;
  historical: { loaded: boolean; requests: number; costThb: number; p95Ms: number | null } | null;
};

export type ApplyScenarioOptions = {
  scenario: string;
  namespace: string;
  actor: string;
  appVersion: string;
  appEnv: string;
  controlsEnabled: boolean;
  allowRemoteReset?: boolean;
  isRemote?: boolean;
  force?: boolean;
};

async function resetTeachingState(db: DbLike, namespace: string, actions: string[]): Promise<void> {
  const deleted = await db
    .delete(requests)
    .where(and(eq(requests.namespace, namespace), eq(requests.dataset, "live")))
    .returning({ id: requests.id });
  actions.push(`cleared ${deleted.length} rehearsal request(s)`);

  await db.delete(requestAdmissions).where(eq(requestAdmissions.namespace, namespace));
  await db.delete(quotaUsage).where(eq(quotaUsage.namespace, namespace));
  await db.delete(budgetEvents).where(eq(budgetEvents.namespace, namespace));
  await db.delete(budgetReservations).where(eq(budgetReservations.namespace, namespace));
  await db.delete(budgetLedger).where(eq(budgetLedger.namespace, namespace));
  actions.push("cleared rate, quota, budget ledger, and reservations");

  await ensureActiveState(db, namespace);
  await db
    .update(activeState)
    .set({
      incidentEnabled: false,
      incidentTopic: null,
      incidentMessage: null,
      incidentOwner: null,
      incidentNextUpdate: null,
      updatedAt: new Date(),
    })
    .where(eq(activeState.namespace, namespace));
  actions.push("cleared incident banner");
}

async function setMode(db: DbLike, namespace: string, mode: ScenarioMode): Promise<void> {
  await db
    .update(activeState)
    .set({ mode, updatedAt: new Date() })
    .where(eq(activeState.namespace, namespace));
}

async function setQuotaUsed(db: DbLike, namespace: string, used: number): Promise<string | null> {
  const [pilot] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(and(eq(appUsers.namespace, namespace), eq(appUsers.username, "pilot")))
    .limit(1);
  if (!pilot) return "pilot account not found; run npm run setup";
  await db.insert(quotaUsage).values({
    namespace,
    userId: pilot.id,
    usageDate: bangkokDate(),
    used,
  });
  return null;
}

async function setBudget(
  db: DbLike,
  namespace: string,
  spentThb: number,
  options: { emitAlert?: boolean } = {},
): Promise<void> {
  const period = bangkokPeriod();
  const limit = COMMON.teaching_budget_thb ?? DEFAULT_BUDGET_LIMIT_THB;
  const alertAt = spentThb >= limit * 0.8 ? new Date() : null;

  await db
    .insert(budgetLedger)
    .values({
      namespace,
      period,
      limitThb: String(limit),
      committedThb: String(spentThb),
      reservedThb: "0",
      alerted80At: alertAt,
    })
    .onConflictDoUpdate({
      target: [budgetLedger.namespace, budgetLedger.period],
      set: {
        limitThb: String(limit),
        committedThb: String(spentThb),
        reservedThb: "0",
        alerted80At: alertAt,
        updatedAt: new Date(),
      },
    });

  if (options.emitAlert && alertAt) {
    await db.insert(budgetEvents).values({
      namespace,
      period,
      kind: "budget_80_percent",
      amountThb: String(spentThb),
      message: `ใช้จ่ายสะสม ${spentThb.toFixed(2)} บาท จากเพดาน ${limit.toFixed(2)} บาท (ถึง 80%)`,
    });
  }
}

export async function applyScenario(
  db: Database,
  options: ApplyScenarioOptions,
): Promise<ResetResult> {
  const scenario = getScenario(options.scenario);

  if (!options.controlsEnabled) {
    throw new ScenarioError(
      "Demo controls are disabled (DEMO_CONTROLS_ENABLED=false). A general learner deployment refuses scenario resets.",
    );
  }
  if (options.isRemote && !options.allowRemoteReset) {
    throw new ScenarioError(
      "Remote reset refused. Pass --allow-remote-reset with an explicit --namespace after checking the target.",
    );
  }

  const warnings: string[] = [];
  const actions: string[] = [];

  if (scenario.required_app_version !== options.appVersion) {
    warnings.push(
      `Scenario ${scenario.id} expects app ${scenario.required_app_version}; this build reports ${options.appVersion}. Deploy the matching tag before recording.`,
    );
  }
  if (scenario.environment && scenario.environment !== options.appEnv) {
    warnings.push(
      `Scenario ${scenario.id} targets ${scenario.environment}; this environment is ${options.appEnv}.`,
    );
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${options.namespace}:reset`}))`,
    );

    await resetTeachingState(tx, options.namespace, actions);

    const isBaselineDocumentSet = scenario.latest_document === "docs-v1";

    if (isBaselineDocumentSet) {
      await removeDocuments(tx, options.namespace, ["docs-v2"]);
      actions.push("kept docs-v1 only (docs-v2 not registered at baseline)");
    }

    await ensureIndex(tx, options.namespace, "docs-v1", "index-v1");
    actions.push("ensured docs-v1 and immutable index-v1");

    if (!isBaselineDocumentSet) {
      await ensureDocument(tx, options.namespace, scenario.latest_document);
      actions.push(`registered ${scenario.latest_document} (not activated by itself)`);
    }

    if (scenario.active_index === "index-v2") {
      await ensureIndex(tx, options.namespace, "docs-v2", "index-v2");
      actions.push("built immutable index-v2 from docs-v2");
    }

    await activateIndex(tx, options.namespace, scenario.active_index);
    actions.push(`activated ${scenario.active_index}`);

    await setMode(tx, options.namespace, scenario.mode as ScenarioMode);
    actions.push(`mode = ${scenario.mode}`);

    let historical: ResetResult["historical"] = null;
    if (scenario.id.startsWith("ep3-")) {
      const loaded = await loadHistoricalDataset(tx, options.namespace, {
        force: options.force,
      });
      const verification = await verifyHistoricalDataset(tx, options.namespace);
      actions.push(
        `historical pilot dataset ${loaded.loaded ? "loaded" : "already present"}: ${verification.requests} requests, THB ${verification.costThb.toFixed(2)}, p95 ${verification.p95Ms} ms`,
      );
      if (!verification.matchesContract) {
        warnings.push(
          `Historical dataset does not match dashboard-contract.json exactly (requests=${verification.requests}, cost=${verification.costThb}, p95=${verification.p95Ms}).`,
        );
      }
      historical = {
        loaded: loaded.loaded,
        requests: verification.requests,
        costThb: verification.costThb,
        p95Ms: verification.p95Ms,
      };
    } else {
      await clearHistoricalDataset(tx, options.namespace);
      actions.push("historical dataset not loaded for this episode");
    }

    if (typeof scenario.used_questions_today === "number") {
      const warning = await setQuotaUsed(
        tx,
        options.namespace,
        scenario.used_questions_today,
      );
      if (warning) warnings.push(warning);
      actions.push(
        `pilot quota used = ${scenario.used_questions_today}/${DAILY_QUOTA} (resets ${nextQuotaResetAt().toISOString()})`,
      );
    }

    if (typeof scenario.spent_thb === "number") {
      await setBudget(tx, options.namespace, scenario.spent_thb, {
        emitAlert: scenario.id === "ep2-budget-warning",
      });
      actions.push(`budget ledger committed = THB ${scenario.spent_thb.toFixed(2)}`);
    } else {
      await setBudget(tx, options.namespace, 0);
      actions.push("budget ledger reset to THB 0.00");
    }

    if (scenario.mode === "incident") {
      const nextUpdate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      await tx
        .update(activeState)
        .set({
          incidentEnabled: true,
          incidentTopic: scenario.pause_topic ?? "opening_hours",
          incidentMessage:
            "พบว่าคู่มือที่ใช้ตอบเป็นฉบับเก่า ระบบจึงหยุดตอบคำถามเรื่องวันและเวลาเปิดบริการชั่วคราว",
          incidentOwner: "ทีมบริการศูนย์ (สมมติ)",
          incidentNextUpdate: nextUpdate,
          updatedAt: new Date(),
        })
        .where(eq(activeState.namespace, options.namespace));
      await tx.insert(incidents).values({
        namespace: options.namespace,
        enabled: true,
        topic: scenario.pause_topic ?? "opening_hours",
        message: "หยุดตอบอัตโนมัติเฉพาะเรื่องเวลาเปิด–ปิด",
        owner: "ทีมบริการศูนย์ (สมมติ)",
        nextUpdateAt: nextUpdate,
      });
      actions.push("incident banner enabled; automatic opening-hours answers paused");
    }

    if (scenario.id === "ep3-fixed-production" || scenario.id === "ep3-fixed-preview") {
      const [existing] = await tx
        .select({ id: releases.id })
        .from(releases)
        .where(
          and(
            eq(releases.namespace, options.namespace),
            eq(releases.environment, scenario.environment ?? options.appEnv),
            eq(releases.appVersion, options.appVersion),
          ),
        )
        .limit(1);
      if (!existing) {
        const [state] = await tx
          .select({ configVersion: activeState.configVersion })
          .from(activeState)
          .where(eq(activeState.namespace, options.namespace));
        await tx.insert(releases).values({
          namespace: options.namespace,
          environment: scenario.environment ?? options.appEnv,
          appVersion: options.appVersion,
          configVersion: state?.configVersion ?? "cfg-1",
          documentVersion: "docs-v2",
          indexVersion: "index-v2",
          commitSha: "recorded-at-reset",
          testSummary: {
            fixture_evaluation: "see /admin/evaluations",
            note: "Reset records the configuration pair only; it does not change the running code.",
          },
          owner: "ทีมการสอน (สมมติ)",
          recoveryInstructions:
            "ถ้าต้องย้อน: เปิดใช้ index-v1 อีกครั้งในหน้า /admin/demo แล้ว deploy tag ก่อนหน้า ฐานข้อมูลไม่ย้อนตามโค้ด",
        });
        actions.push("recorded release entry for the corrected configuration");
      }
    }

    await bumpConfigVersion(tx, options.namespace);
    const activeIndex = await getActiveIndexKey(tx, options.namespace);

    await tx.insert(resetAudit).values({
      namespace: options.namespace,
      scenario: scenario.id,
      actor: options.actor,
      outcome: "applied",
      details: { actions, warnings, activeIndex, mode: scenario.mode },
    });

    return {
      scenario: scenario.id,
      namespace: options.namespace,
      actor: options.actor,
      applied: true,
      actions,
      warnings,
      activeIndex,
      mode: scenario.mode,
      historical,
    } satisfies ResetResult;
  });

  return result;
}
