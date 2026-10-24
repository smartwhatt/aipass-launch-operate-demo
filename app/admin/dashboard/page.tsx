import Link from "next/link";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { evaluationRuns, requests } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/auth/guards";
import { getDashboardMetrics } from "@/lib/telemetry/metrics";
import { HISTORICAL_PERIOD, parseMetricsFilter } from "@/lib/telemetry/filter";
import { formatNumber, formatPercent, formatThb, formatThaiDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { TEACHING_CASES } from "@/lib/calculator/teaching-prices";
import { SCENARIOS } from "@/lib/seed/scenarios";

export const dynamic = "force-dynamic";

const GATE = { maxErrorRate: 0.02, maxP95Ms: 8000 };

function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00+07:00`);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage("/admin/dashboard");
  const params = await searchParams;
  const config = getConfig();
  const url = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") url.set(key, value);
  }

  const filter = parseMetricsFilter(url, config.DATA_NAMESPACE);
  const db = getDb();
  const metrics = await getDashboardMetrics(db, filter);

  const recent = await db
    .select({
      requestId: requests.requestId,
      question: requests.question,
      status: requests.status,
      mode: requests.mode,
      latencyMs: requests.latencyMs,
      documentVersion: requests.documentVersion,
      indexVersion: requests.indexVersion,
      createdAt: requests.createdAt,
    })
    .from(requests)
    .where(
      and(
        eq(requests.namespace, filter.namespace),
        eq(requests.dataset, filter.dataset),
        gte(requests.createdAt, dayStart(filter.from)),
        lt(requests.createdAt, new Date(dayStart(filter.to).getTime() + 86_400_000)),
      ),
    )
    .orderBy(desc(requests.createdAt))
    .limit(12);

  const [latestRun] = await db
    .select({
      id: evaluationRuns.id,
      passed: evaluationRuns.passed,
      total: evaluationRuns.total,
      criticalPassed: evaluationRuns.criticalPassed,
      criticalTotal: evaluationRuns.criticalTotal,
      finishedAt: evaluationRuns.finishedAt,
      mode: evaluationRuns.mode,
    })
    .from(evaluationRuns)
    .where(and(eq(evaluationRuns.namespace, config.DATA_NAMESPACE), eq(evaluationRuns.status, "completed")))
    .orderBy(desc(evaluationRuns.finishedAt))
    .limit(1);

  const baseline = TEACHING_CASES.find((entry) => entry.id === "baseline");
  const budgetLimit =
    SCENARIOS.find((scenario) => scenario.id === "ep2-budget-full") !== undefined
      ? 1000
      : 1000;

  const service = metrics.service;
  const quality = metrics.quality;

  const gates = [
    {
      label: "อัตราข้อผิดพลาด ≤ 2%",
      value: `${formatPercent(service.errorRate, 1)} (${service.errors}/${service.requests})`,
      pass: service.requests > 0 && service.errorRate <= GATE.maxErrorRate,
    },
    {
      label: "p95 ≤ 8 วินาที",
      value: service.p95Ms === null ? "ไม่มีข้อมูล" : `${(service.p95Ms / 1000).toFixed(1)} วินาที`,
      pass: service.p95Ms !== null && service.p95Ms <= GATE.maxP95Ms,
    },
    {
      label: "ชุดคำถามสำคัญผ่านครบ",
      value: latestRun
        ? `${latestRun.criticalPassed}/${latestRun.criticalTotal} (${latestRun.mode})`
        : "ยังไม่มีการประเมิน",
      pass: Boolean(latestRun && latestRun.criticalPassed === latestRun.criticalTotal),
    },
    {
      label: "งบคาดการณ์ ≤ 1,000 บาท/เดือน",
      value: baseline ? `${formatThb(baseline.total_thb, 0)} บาท` : "—",
      pass: Boolean(baseline && baseline.total_thb <= budgetLimit),
    },
  ];

  return (
    <div className="stack stack-lg">
      <form className="card" method="get" aria-label="ตัวกรองแดชบอร์ด">
        <div className="row" style={{ alignItems: "flex-end", gap: "0.9rem" }}>
          <label className="field" style={{ flex: "1 1 9rem" }}>
            <span className="field__label">ตั้งแต่</span>
            <input className="input" type="date" name="from" defaultValue={filter.from} />
          </label>
          <label className="field" style={{ flex: "1 1 9rem" }}>
            <span className="field__label">ถึง</span>
            <input className="input" type="date" name="to" defaultValue={filter.to} />
          </label>
          <label className="field" style={{ flex: "1 1 10rem" }}>
            <span className="field__label">ชุดข้อมูล</span>
            <select className="select" name="dataset" defaultValue={filter.dataset}>
              <option value="historical-pilot">ข้อมูล pilot ย้อนหลัง</option>
              <option value="live">คำขอจากการซ้อม</option>
            </select>
          </label>
          <label className="field" style={{ flex: "1 1 7rem" }}>
            <span className="field__label">โหมด</span>
            <select className="select" name="mode" defaultValue={filter.mode}>
              <option value="all">ทั้งหมด</option>
              <option value="fixture">Fixture</option>
              <option value="live">Live</option>
            </select>
          </label>
          <label className="field" style={{ flex: "1 1 8rem" }}>
            <span className="field__label">สภาพแวดล้อม</span>
            <select className="select" name="environment" defaultValue={filter.environment ?? "all"}>
              <option value="all">ทั้งหมด</option>
              <option value="local">Local</option>
              <option value="preview">Preview</option>
              <option value="production">Production</option>
            </select>
          </label>
          <button className="button button--ghost" type="submit">
            ใช้ตัวกรอง
          </button>
        </div>
        <p className="tiny faint" style={{ marginTop: "0.75rem" }}>
          ค่าเริ่มต้นคือหน้าต่างข้อมูลการสอน {HISTORICAL_PERIOD.from} ถึง {HISTORICAL_PERIOD.to} ·
          คำขอจากการซ้อมถูกเก็บแยกชุด จึงไม่เปลี่ยนตัวเลขชุดนี้
        </p>
      </form>

      <div className="split-panels">
        <section>
          <div className="row-between" style={{ marginBottom: "0.75rem" }}>
            <h2 className="card__kicker" style={{ letterSpacing: "0.08em" }}>
              บริการ (service)
            </h2>
            <span className="tiny faint">
              {service.periodFrom} → {service.periodTo}
            </span>
          </div>
          <div className="grid-2">
            <div className="metric">
              <span className="metric__label">คำขอทั้งหมด</span>
              <span className="metric__value">{formatNumber(service.requests)}</span>
              <span className="metric__foot">{service.users} ผู้ใช้ · {service.modelCalls} model calls</span>
            </div>
            <div className="metric">
              <span className="metric__label">คำขอที่ผิดพลาด</span>
              <span className="metric__value">
                {service.errors}
                <span className="faint" style={{ fontSize: "0.95rem", fontWeight: 400 }}>
                  {" "}
                  / {service.requests}
                </span>
              </span>
              <span className="metric__foot">{formatPercent(service.errorRate, 1)} ของคำขอ</span>
            </div>
            <div className="metric">
              <span className="metric__label">p95 (nearest rank)</span>
              <span className="metric__value">
                {service.p95Ms === null ? "—" : `${(service.p95Ms / 1000).toFixed(1)}s`}
              </span>
              <span className="metric__foot">
                p50 {service.p50Ms ?? "—"} ms · p99 {service.p99Ms ?? "—"} ms
              </span>
            </div>
            <div className="metric">
              <span className="metric__label">ค่าใช้จ่าย (ข้อมูลจำลอง)</span>
              <span className="metric__value">{formatThb(service.costFixtureThb)} ฿</span>
              <span className="metric__foot">
                live {formatThb(service.costLiveThb)} ฿ · ไม่ทราบ usage {service.unknownUsageCalls}
              </span>
            </div>
          </div>
        </section>

        <section>
          <div className="row-between" style={{ marginBottom: "0.75rem" }}>
            <h2 className="card__kicker" style={{ letterSpacing: "0.08em" }}>
              คุณภาพคำตอบ (answer quality)
            </h2>
            <Link className="tiny" href="/admin/evaluations" prefetch={false}>
              เปิดการประเมิน
            </Link>
          </div>
          <div className="grid-2">
            <div className="metric">
              <span className="metric__label">ข้อมูลไม่พอ</span>
              <span className="metric__value">
                {quality.insufficientInfo}
                <span className="faint" style={{ fontSize: "0.95rem", fontWeight: 400 }}>
                  {" "}
                  / {service.requests}
                </span>
              </span>
              <span className="metric__foot">
                {formatPercent(service.insufficientInfoRate, 0)} ของคำขอทั้งหมด
              </span>
            </div>
            <div className="metric">
              <span className="metric__label">ความคิดเห็น</span>
              <span className="metric__value">{quality.feedbackCount}</span>
              <span className="metric__foot">{formatPercent(quality.feedbackRate, 0)} ของคำขอ</span>
            </div>
            <div className="metric">
              <span className="metric__label">ต้องแก้ไข</span>
              <span className="metric__value">
                {quality.needsCorrection}
                <span className="faint" style={{ fontSize: "0.95rem", fontWeight: 400 }}>
                  {" "}
                  / {quality.feedbackCount}
                </span>
              </span>
              <span className="metric__foot">
                {formatPercent(quality.correctionRate, 0)} ของผู้ที่ให้ความคิดเห็น
              </span>
            </div>
            <div className="metric">
              <span className="metric__label">ชุดข้อมูล</span>
              <span className="metric__value mono" style={{ fontSize: "1rem" }}>
                {filter.dataset}
              </span>
              <span className="metric__foot">{filter.mode === "all" ? "ทุกโหมด" : filter.mode}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">เกณฑ์ตัดสินก่อนขยายผู้ใช้ (ตัวอย่างการสอน)</h2>
          <span className="tiny faint">เกณฑ์นี้เป็นตัวอย่าง ไม่ใช่ผลการสังเกต pilot จริง</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>เกณฑ์</th>
                <th>ค่าที่พบ</th>
                <th>ผล</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((gate) => (
                <tr key={gate.label}>
                  <td>{gate.label}</td>
                  <td className="mono">{gate.value}</td>
                  <td>
                    {gate.pass ? (
                      <span className="badge badge--ok">ผ่าน</span>
                    ) : (
                      <span className="badge badge--danger">ไม่ผ่าน</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: "0.9rem" }}>
          {gates.some((gate) => !gate.pass)
            ? "สรุป: ยังไม่ควรขยายเป็น 100 ผู้ใช้ ต้องแก้คำตอบที่ผิดและลดอัตราข้อผิดพลาดก่อน"
            : "สรุป: ผ่านเกณฑ์ตัวอย่างทั้งหมด ยังต้องยืนยันด้วยการสังเกตจริงก่อนขยาย"}
        </p>
      </section>

      <section>
        <div className="row-between" style={{ marginBottom: "0.75rem" }}>
          <h2 className="card__kicker" style={{ letterSpacing: "0.08em" }}>
            คำขอล่าสุดในชุดข้อมูลนี้
          </h2>
          <Link className="tiny" href={`/admin/traces/DEMO-R042`} prefetch={false}>
            เปิดร่องรอย DEMO-R042
          </Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>คำขอ</th>
                <th>คำถาม</th>
                <th>สถานะ</th>
                <th className="num">เวลา (ms)</th>
                <th>เวอร์ชัน</th>
                <th>เมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    ไม่มีคำขอในช่วงนี้
                  </td>
                </tr>
              ) : (
                recent.map((row) => (
                  <tr key={row.requestId}>
                    <td>
                      <Link
                        className="mono tiny"
                        href={`/admin/traces/${encodeURIComponent(row.requestId)}`}
                        prefetch={false}
                      >
                        {row.requestId}
                      </Link>
                    </td>
                    <td style={{ maxWidth: "22rem" }}>{row.question}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="num">{row.latencyMs ?? "—"}</td>
                    <td className="mono tiny">
                      {row.documentVersion ?? "—"} / {row.indexVersion ?? "—"}
                    </td>
                    <td className="tiny nowrap">
                      {row.createdAt ? formatThaiDateTime(row.createdAt) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="tiny faint" style={{ marginTop: "0.6rem" }}>
          สถานะในตารางคือสถานะของคำขอ ไม่ใช่ความถูกต้องของคำตอบ — คำตอบที่ผิดยังนับเป็นคำขอที่สำเร็จได้
        </p>
      </section>
    </div>
  );
}
