"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Summary = {
  runId: string;
  mode: string;
  docKey: string;
  indexKey: string;
  total: number;
  passed: number;
  criticalPassed: number;
  criticalTotal: number;
  minimumTotalPass: number;
  meetsGate: boolean;
  cases: Array<{
    caseId: string;
    question: string;
    status: string;
    expectedStatus: string;
    passed: boolean;
    failures: string[];
    citations: Array<{ sectionId: string; version: string }>;
  }>;
};

export function EvaluationRunner({ defaultMode = "fixture" }: { defaultMode?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState(defaultMode);
  const [target, setTarget] = useState("active");
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/evaluations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          target: target === "active" ? undefined : target,
          suite: "current",
        }),
      });
      const payload = (await response.json()) as Summary & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "รันการประเมินไม่สำเร็จ");
      setSummary(payload);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "รันการประเมินไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack stack-sm">
      <div className="row" style={{ alignItems: "flex-end", gap: "0.75rem" }}>
        <label className="field" style={{ flex: "0 1 10rem" }}>
          <span className="field__label">โหมด</span>
          <select className="select" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="fixture">fixture</option>
            <option value="live">live</option>
          </select>
        </label>
        <label className="field" style={{ flex: "0 1 12rem" }}>
          <span className="field__label">ดัชนีเป้าหมาย</span>
          <select className="select" value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="active">ดัชนีที่ใช้งานอยู่</option>
            <option value="docs-v2">docs-v2 / index-v2</option>
            <option value="docs-v1">docs-v1 / index-v1</option>
          </select>
        </label>
        <button className="button" type="button" onClick={() => void run()} disabled={pending}>
          {pending ? "กำลังประเมิน…" : "รัน Q01–Q10"}
        </button>
      </div>

      {mode === "live" ? (
        <p className="tiny faint">
          โหมด live ต้องมี GEMINI_API_KEY และราคาที่ตรวจสอบแล้ว ถ้าไม่มี ระบบจะรายงานว่าถูกบล็อก
          ไม่ใช่ผ่าน
        </p>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      {summary ? (
        <div className="stack stack-sm" style={{ marginTop: "0.75rem" }}>
          <div className={summary.meetsGate ? "notice notice--ok" : "notice notice--danger"}>
            <div className="row-between">
              <div className="notice__title">
                {summary.meetsGate ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์"}
              </div>
              <span className="small mono">
                {summary.passed}/{summary.total} · critical {summary.criticalPassed}/
                {summary.criticalTotal}
              </span>
            </div>
            <p className="tiny faint">
              run {summary.runId.slice(0, 8)} · {summary.mode} · {summary.docKey} /{" "}
              {summary.indexKey}
            </p>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ข้อ</th>
                  <th>สถานะจริง</th>
                  <th>อ้างอิง</th>
                  <th>ผล</th>
                </tr>
              </thead>
              <tbody>
                {summary.cases.map((testCase) => (
                  <tr key={testCase.caseId}>
                    <td className="mono">{testCase.caseId}</td>
                    <td className="mono tiny">{testCase.status}</td>
                    <td className="mono tiny">
                      {testCase.citations.map((citation) => citation.sectionId).join(", ") || "—"}
                    </td>
                    <td>
                      {testCase.passed ? (
                        <span className="badge badge--ok">ผ่าน</span>
                      ) : (
                        <span className="badge badge--danger" title={testCase.failures.join("; ")}>
                          ไม่ผ่าน
                        </span>
                      )}
                      {testCase.failures.length > 0 ? (
                        <div className="tiny faint">{testCase.failures.join("; ")}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
