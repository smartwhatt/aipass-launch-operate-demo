"use client";

import { useMemo, useState } from "react";
import { calculateCost, validateCalculatorInputs } from "@/lib/calculator/model";
import { TEACHING_CASES } from "@/lib/calculator/teaching-prices";

/**
 * Browser view of the same formulas as the Excel workbook.
 *
 * This is a convenience view only: the .xlsx workbook is the required
 * deliverable. Prices are the fictional teaching prices.
 */

type Field = {
  key: keyof Inputs;
  label: string;
  hint: string;
  unit: string;
  step?: string;
  min?: number;
  max?: number;
};

type Inputs = {
  users: number;
  questionsPerDay: number;
  activeDays: number;
  callsPerQuestion: number;
  inputTokens: number;
  outputTokens: number;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  thbPerUsd: number;
  hostingThbMonth: number;
  domainThbYear: number;
  otherVariableThbQuestion: number;
  otherFixedThbMonth: number;
  contingency: number;
};

const DEFAULTS: Inputs = {
  users: 100,
  questionsPerDay: 5,
  activeDays: 22,
  callsPerQuestion: 1,
  inputTokens: 1500,
  outputTokens: 500,
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 5,
  thbPerUsd: 35,
  hostingThbMonth: 300,
  domainThbYear: 600,
  otherVariableThbQuestion: 0,
  otherFixedThbMonth: 0,
  contingency: 0,
};

const FIELDS: Field[] = [
  { key: "users", label: "จำนวนผู้ใช้", hint: "จำนวนผู้ใช้ต่อเดือน", unit: "คน", min: 0 },
  { key: "questionsPerDay", label: "คำถามต่อผู้ใช้ต่อวัน", hint: "เฉลี่ยต่อคน", unit: "คำถาม", min: 0 },
  { key: "activeDays", label: "วันทำการต่อเดือน", hint: "0–31 วัน", unit: "วัน", min: 0, max: 31 },
  { key: "callsPerQuestion", label: "การเรียกโมเดลต่อคำถาม", hint: "อย่างน้อย 1 (เผื่อ retry ใช้ 1.1)", unit: "ครั้ง", min: 0, step: "0.1" },
  { key: "inputTokens", label: "token เข้าต่อครั้ง", hint: "input tokens", unit: "token", min: 0 },
  { key: "outputTokens", label: "token ออกต่อครั้ง", hint: "output tokens", unit: "token", min: 0 },
  { key: "inputUsdPerMillion", label: "ราคา token เข้า", hint: "USD ต่อล้าน token", unit: "USD/ล้าน", min: 0, step: "0.01" },
  { key: "outputUsdPerMillion", label: "ราคา token ออก", hint: "USD ต่อล้าน token", unit: "USD/ล้าน", min: 0, step: "0.01" },
  { key: "thbPerUsd", label: "อัตราแลกเปลี่ยน", hint: "บาทต่อดอลลาร์ ต้องมากกว่า 0", unit: "บาท/USD", min: 0, step: "0.1" },
  { key: "hostingThbMonth", label: "ค่า hosting", hint: "ต่อเดือน", unit: "บาท/เดือน", min: 0 },
  { key: "domainThbYear", label: "ค่าโดเมน", hint: "ต่อปี (หาร 12 ในสูตร)", unit: "บาท/ปี", min: 0 },
  { key: "otherVariableThbQuestion", label: "ค่าใช้จ่ายผันแปรอื่น", hint: "ต่อคำถาม", unit: "บาท/คำถาม", min: 0, step: "0.01" },
  { key: "otherFixedThbMonth", label: "ค่าใช้จ่ายคงที่อื่น", hint: "ต่อเดือน", unit: "บาท/เดือน", min: 0, step: "0.01" },
];

function calculate(inputs: Inputs) {
  const result = calculateCost(inputs);
  return {
    questions: result.questionsPerMonth,
    calls: result.modelCalls,
    costPerCall: result.costPerCallThb,
    variablePerQuestion: result.variablePerQuestionThb,
    totalVariable: result.modelCostThb,
    fixed: result.fixedCostThb,
    subtotal: result.subtotalThb,
    contingency: result.contingencyThb,
    total: result.totalThb,
    perQuestion: result.perQuestionThb,
    perQuestionMeaningful: result.perQuestionMeaningful,
  };
}

function money(value: number, digits = 2): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function count(value: number): string {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
}

export function Calculator({ canDownload }: { canDownload: boolean }) {
  const [inputs, setInputs] = useState<Inputs>(DEFAULTS);
  const [errors, setErrors] = useState<string[]>([]);

  function update(key: keyof Inputs, raw: string) {
    const value = raw === "" ? 0 : Number(raw);
    const next = { ...inputs, [key]: Number.isFinite(value) ? value : 0 };
    setInputs(next);
    setErrors(validate(next));
  }

  const result = useMemo(() => calculate(inputs), [inputs]);

  const scenarios = useMemo(
    () =>
      [
        { label: "พื้นฐาน 100 ผู้ใช้", users: 100, questionsPerDay: 5, activeDays: 22, callsPerQuestion: 1 },
        { label: "1,000 ผู้ใช้", users: 1000, questionsPerDay: 5, activeDays: 22, callsPerQuestion: 1 },
        { label: "100 ผู้ใช้ + retry 1.1", users: 100, questionsPerDay: 5, activeDays: 22, callsPerQuestion: 1.1 },
      ].map((scenario) => ({
        ...scenario,
        result: calculate({ ...inputs, ...scenario }),
      })),
    [inputs],
  );

  const zero = calculate({ ...inputs, users: 0 });
  const doubledFx = calculate({ ...inputs, thbPerUsd: inputs.thbPerUsd * 2 });
  const baselineCase = TEACHING_CASES.find((entry) => entry.id === "baseline");

  return (
    <div className="stack stack-lg">
      <div className="notice">
        <div className="notice__title">ราคาสมมติสำหรับการสอน</div>
        <p className="small muted">
          ตัวเลขทั้งหมดในหน้านี้เป็นราคาสมมติของบทเรียน ไม่ใช่ราคาจริงของผู้ให้บริการ
          และไม่ผูกกับโมเดลที่แอปใช้จริง ห้ามใช้หน้านี้แทนการตรวจราคาจริงก่อนตั้งงบ
        </p>
      </div>

      <div className="calc-grid">
        <section>
          <h2 className="card__kicker" style={{ letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            ปัจจัยนำเข้า (Inputs)
          </h2>
          <div className="calc-inputs">
            {FIELDS.map((field) => (
              <label className="calc-row" key={field.key}>
                <span className="calc-row__label">
                  {field.label}
                  <span>
                    {field.hint} · {field.unit}
                  </span>
                </span>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={field.min ?? 0}
                  max={field.max}
                  step={field.step ?? "1"}
                  value={String(inputs[field.key])}
                  onChange={(event) => update(field.key, event.target.value)}
                />
              </label>
            ))}
            <label className="calc-row">
              <span className="calc-row__label">
                เงินสำรองเผื่อ (contingency)
                <span>0%–100% ของยอดรวม</span>
              </span>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                step="1"
                value={String(Math.round(inputs.contingency * 100))}
                onChange={(event) => {
                  const percent = Number(event.target.value || 0);
                  const next = { ...inputs, contingency: Math.min(1, Math.max(0, percent / 100)) };
                  setInputs(next);
                  setErrors(validate(next));
                }}
              />
            </label>
          </div>

          {errors.length > 0 ? (
            <div className="notice notice--danger" style={{ marginTop: "1rem" }}>
              <div className="notice__title">ค่าที่กรอกยังไม่ถูกต้อง</div>
              <ul className="small">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <details style={{ marginTop: "1.25rem" }}>
            <summary className="small muted" style={{ cursor: "pointer" }}>
              สูตรเดียวกับชีต Scenarios ในไฟล์ Excel
            </summary>
            <pre className="mono tiny" style={{ overflowX: "auto", lineHeight: 1.7 }}>
{`B7  =B2*B3*B4
B8  =B7*B5
B9  =(Inputs!$B$6*Inputs!$B$8+Inputs!$B$7*Inputs!$B$9)/1000000*Inputs!$B$10
B10 =B5*B9+Inputs!$B$13
B11 =B7*B10
B12 =Inputs!$B$11+Inputs!$B$12/12+Inputs!$B$14
B13 =B11+B12
B14 =B13*Inputs!$B$15
B15 =B13+B14
B16 =IF(B7=0,0,B15/B7)`}
            </pre>
          </details>

          <p className="tiny faint" style={{ marginTop: "0.75rem" }}>
            ช่วงค่าที่อนุญาต: ผู้ใช้/คำถาม/วัน/โทเคน เป็นจำนวนเต็มไม่ติดลบ · วัน 0–31 ·
            เรียกโมเดลต่อคำถาม ≥ 0 (ปกติ ≥ 1) · อัตราแลกเปลี่ยน &gt; 0 · เงินสำรอง 0%–100%
          </p>
        </section>

        <section>
          <div className="row-between" style={{ marginBottom: "0.75rem" }}>
            <h2 className="card__kicker" style={{ letterSpacing: "0.08em" }}>
              ผลลัพธ์ (Scenarios · คอลัมน์พื้นฐาน)
            </h2>
            <span className="tiny faint">บาท (THB)</span>
          </div>

          <div className="card" style={{ padding: "1rem 1.25rem" }}>
            <div className="result-line">
              <span>คำถามต่อเดือน</span>
              <span className="result-line__value">{count(result.questions)}</span>
            </div>
            <div className="result-line">
              <span>การเรียกโมเดลต่อเดือน</span>
              <span className="result-line__value">{count(result.calls)}</span>
            </div>
            <div className="result-line">
              <span>ต้นทุนต่อการเรียก 1 ครั้ง</span>
              <span className="result-line__value">{money(result.costPerCall, 4)}</span>
            </div>
            <div className="result-line">
              <span>ต้นทุนโมเดลรวม</span>
              <span className="result-line__value">{money(result.totalVariable)}</span>
            </div>
            <div className="result-line">
              <span>ต้นทุนคงที่ต่อเดือน (hosting + โดเมน/12)</span>
              <span className="result-line__value">{money(result.fixed)}</span>
            </div>
            <div className="result-line">
              <span>เงินสำรองเผื่อ</span>
              <span className="result-line__value">{money(result.contingency)}</span>
            </div>
            <div className="result-line result-line--total">
              <span>รวมต่อเดือน</span>
              <span className="result-line__value">{money(result.total)}</span>
            </div>
            <div className="result-line">
              <span>เฉลี่ยต่อคำถาม</span>
              <span className="result-line__value">
                {result.perQuestionMeaningful ? money(result.perQuestion, 4) : "ไม่มีความหมาย (0 คำถาม)"}
              </span>
            </div>
          </div>

          <div className="table-wrap" style={{ marginTop: "1.25rem" }}>
            <table className="table table--numeric">
              <thead>
                <tr>
                  <th>สถานการณ์</th>
                  <th className="num">คำถาม</th>
                  <th className="num">รวม (บาท)</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((scenario) => (
                  <tr key={scenario.label}>
                    <td>{scenario.label}</td>
                    <td className="num">{count(scenario.result.questions)}</td>
                    <td className="num">{money(scenario.result.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>การตรวจ</th>
                  <th>ค่าที่ได้</th>
                  <th>ผล</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>ผู้ใช้ 0 คน → เหลือต้นทุนคงที่</td>
                  <td className="mono tiny">{money(zero.total)} บาท</td>
                  <td>
                    {Math.abs(zero.total - result.fixed) < 0.005 && zero.questions === 0 ? (
                      <span className="badge badge--ok">ผ่าน</span>
                    ) : (
                      <span className="badge badge--danger">ไม่ผ่าน</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>อัตราแลกเปลี่ยน ×2 → ต้นทุน USD เพิ่มเป็นสองเท่า</td>
                  <td className="mono tiny">
                    {money(result.totalVariable)} → {money(doubledFx.totalVariable)} บาท
                  </td>
                  <td>
                    {Math.abs(doubledFx.totalVariable - result.totalVariable * 2) < 0.01 &&
                    Math.abs(doubledFx.fixed - result.fixed) < 0.005 ? (
                      <span className="badge badge--ok">ผ่าน</span>
                    ) : (
                      <span className="badge badge--danger">ไม่ผ่าน</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>ค่าตั้งต้นตรงกับเคสพื้นฐานในไฟล์ทดสอบ</td>
                  <td className="mono tiny">
                    {baselineCase ? `${money(baselineCase.total_thb)} บาท` : "—"}
                  </td>
                  <td>
                    {Math.abs(result.total - 1890) < 0.01 ? (
                      <span className="badge badge--ok">ผ่าน</span>
                    ) : (
                      <span className="badge">เปลี่ยนค่าอยู่</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: "1.25rem" }}>
            {canDownload ? (
              <a className="button" href="/downloads/AIPASS_AI_App_Cost_Calculator_v1.xlsx" download>
                ดาวน์โหลดไฟล์ Excel
              </a>
            ) : (
              <a className="button button--ghost" href="/login?next=/calculator">
                เข้าสู่ระบบเพื่อดาวน์โหลด
              </a>
            )}
            <span className="tiny faint">
              ไฟล์ .xlsx เป็นชิ้นงานบังคับ · หน้านี้เป็นเพียงมุมมองในเบราว์เซอร์
            </span>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">ข้อจำกัดที่ต้องบอกผู้เรียน</h2>
        </div>
        <ul className="small muted" style={{ display: "grid", gap: "0.45rem" }}>
          <li>ใบเรียกเก็บจริงอาจมี cache pricing, reasoning tokens, tools, embeddings, storage, network, context tiers และภาษี</li>
          <li>สเปรดชีตไม่สามารถบังคับงบประมาณของ API ได้ — การบังคับงบต้องอยู่ที่ฝั่งแอป (จองก่อนเรียก แล้วคืนส่วนที่ไม่ได้ใช้)</li>
          <li>ต้นทุนคงที่ 350 บาท = hosting 300 บาท + ค่าโดเมน 50 บาท/เดือน (600 บาทต่อปี หาร 12) ไม่ใช่ค่าสมาชิกแชท</li>
          <li>ตัวเลข 1,890 บาท เป็นราคาสมมติของการสอน ไม่ใช่ใบเสนอราคา</li>
          <li>ผู้ใช้ 0 คน: สูตรคืนค่า 0 ในช่องต่อคำถามเพื่อกันหารากที่สองไม่ได้ แต่ “ต่อคำถาม” ไม่มีความหมาย</li>
        </ul>
      </section>
    </div>
  );
}

function validate(inputs: Inputs): string[] {
  return validateCalculatorInputs(inputs).map((issue) => issue.message);
}
