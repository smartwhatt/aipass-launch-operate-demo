import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { evaluationResults, evaluationRuns } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/auth/guards";
import { formatThaiDateTime } from "@/lib/format";
import { EvaluationRunner } from "@/components/admin/evaluation-runner";

export const dynamic = "force-dynamic";

export default async function EvaluationsPage() {
  await requireAdminPage("/admin/evaluations");
  const config = getConfig();
  const db = getDb();

  const runs = await db
    .select()
    .from(evaluationRuns)
    .where(eq(evaluationRuns.namespace, config.DATA_NAMESPACE))
    .orderBy(desc(evaluationRuns.startedAt))
    .limit(8);

  const latest = runs.find((run) => run.status === "completed") ?? null;
  const results = latest
    ? await db
        .select()
        .from(evaluationResults)
        .where(eq(evaluationResults.runId, latest.id))
        .orderBy(evaluationResults.caseId)
    : [];

  return (
    <div className="stack stack-lg">
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">รันชุดคำถาม Q01–Q10</h2>
          <span className="tiny faint">
            เกณฑ์: critical ผ่านครบ และผ่านรวมอย่างน้อย 9 จาก 10 ข้อ
          </span>
        </div>
        <EvaluationRunner />
      </section>

      {latest ? (
        <section>
          <div className="row-between" style={{ marginBottom: "0.75rem" }}>
            <h2 className="card__kicker" style={{ letterSpacing: "0.08em" }}>
              ผลล่าสุด
            </h2>
            <span className="tiny faint">
              {formatThaiDateTime(latest.startedAt)} · {latest.mode} · {latest.targetDocument} /{" "}
              {latest.targetIndex} · app v{latest.appVersion}
            </span>
          </div>

          <div className="row" style={{ gap: "0.5rem", marginBottom: "0.9rem" }}>
            <span className="badge badge--ink">รวม {latest.passed}/{latest.total}</span>
            <span className="badge">
              critical {latest.criticalPassed}/{latest.criticalTotal}
            </span>
            <span className="badge">
              prompt {String((latest.summary as Record<string, unknown>).prompt_version ?? "prompt-1")}
            </span>
            <span className="badge">{latest.commitSha?.slice(0, 12) ?? "commit —"}</span>
            {(latest.summary as Record<string, unknown>).meets_gate ? (
              <span className="badge badge--ok">ผ่านเกณฑ์</span>
            ) : (
              <span className="badge badge--danger">ไม่ผ่านเกณฑ์</span>
            )}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ข้อ</th>
                  <th>คำถาม</th>
                  <th>คาดหวัง</th>
                  <th>ผลจริง</th>
                  <th>อ้างอิง</th>
                  <th>ผล</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id}>
                    <td className="mono">{result.caseId}</td>
                    <td style={{ maxWidth: "18rem" }}>{result.question}</td>
                    <td className="mono tiny">
                      {result.expectedStatus}
                      {result.expectedSection ? ` · ${result.expectedSection}` : ""}
                    </td>
                    <td className="mono tiny">{result.status}</td>
                    <td className="mono tiny">
                      {(result.citations ?? [])
                        .map((citation) => `${citation.version}:${citation.sectionId}`)
                        .join(", ") || "—"}
                    </td>
                    <td>
                      {result.passed ? (
                        <span className="badge badge--ok">ผ่าน</span>
                      ) : (
                        <span className="badge badge--danger">ไม่ผ่าน</span>
                      )}
                      {(result.failures ?? []).length > 0 ? (
                        <div className="tiny faint">{result.failures.join("; ")}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details style={{ marginTop: "1rem" }}>
            <summary className="small muted" style={{ cursor: "pointer" }}>
              ดูคำตอบจริงทีละข้อ
            </summary>
            <div className="stack stack-sm" style={{ marginTop: "0.75rem" }}>
              {results.map((result) => (
                <div className="card" key={`answer-${result.id}`}>
                  <div className="row-between">
                    <span className="mono small">{result.caseId}</span>
                    <span className="tiny faint">{result.latencyMs} ms</span>
                  </div>
                  <p className="small" style={{ marginTop: "0.4rem" }}>
                    {result.answer}
                  </p>
                </div>
              ))}
            </div>
          </details>
        </section>
      ) : (
        <p className="small muted">
          ยังไม่มีผลการประเมิน — รันชุดคำถามด้านบน หรือใช้ <span className="mono">npm run eval</span>
        </p>
      )}

      <section>
        <h2 className="card__kicker" style={{ letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
          ประวัติการรัน
        </h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>เริ่ม</th>
                <th>โหมด</th>
                <th>เป้าหมาย</th>
                <th className="num">ผ่าน</th>
                <th className="num">critical</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    ยังไม่มีการรัน
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run.id}>
                    <td className="tiny nowrap">{formatThaiDateTime(run.startedAt)}</td>
                    <td className="mono tiny">{run.mode}</td>
                    <td className="mono tiny">
                      {run.targetDocument} / {run.targetIndex}
                    </td>
                    <td className="num">
                      {run.passed ?? "—"}/{run.total ?? "—"}
                    </td>
                    <td className="num">
                      {run.criticalPassed ?? "—"}/{run.criticalTotal ?? "—"}
                    </td>
                    <td>
                      <span className={run.status === "completed" ? "badge" : "badge badge--warn"}>
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="tiny faint" style={{ marginTop: "0.6rem" }}>
          ผลการรันแบบ fixture ไม่ใช่หลักฐานของ live model — ต้องรันโหมด live แยกและบันทึกผลจริง
        </p>
        <Link className="tiny" href="/admin/releases" prefetch={false}>
          บันทึกรุ่นที่เผยแพร่ →
        </Link>
      </section>
    </div>
  );
}
