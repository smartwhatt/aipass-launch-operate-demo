/**
 * Purpose: independent release gate for the offline Excel cost calculator.
 *
 * Usage:
 *   npm run calculator:build && npm run calculator:check
 *
 * The TypeScript side owns the expectations. It spawns the project Python venv
 * (formulas 1.3.4 + openpyxl) and asks that process to:
 *   - load the real .xlsx twice (formulas and cached values),
 *   - recalculate every workbook formula with the `formulas` engine,
 *   - report sheet protection, cell locks, data validations, and merged ranges.
 * The process prints one JSON document between sentinels; this file compares it
 * with fixtures/calculator-layout.json and fixtures/cost-cases.json. Any
 * mismatch prints FAIL and exits non-zero.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import calculatorLayout from "@/fixtures/calculator-layout.json";
import costCases from "@/fixtures/cost-cases.json";

const layout = calculatorLayout as unknown as {
  filename: string;
  sheets: string[];
  input_defaults: Record<string, number>;
  baseline_formulas: Record<string, string>;
};

const PYTHON_SCRIPT = String.raw`
import json
import re
import sys
import traceback

import numpy as np
import openpyxl
from openpyxl.worksheet.cell_range import MultiCellRange

path = sys.argv[1]
report = {"ok": False}


def scalar(value):
    if isinstance(value, np.ndarray):
        value = value.flat[0] if value.size else None
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and value != value:
        return None
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def dv_record(dv):
    operator = dv.operator
    if operator is None and dv.formula2 is not None:
        operator = "between"
    return {
        "sqref": str(dv.sqref),
        "type": dv.type,
        "operator": operator,
        "formula1": scalar(dv.formula1),
        "formula2": scalar(dv.formula2),
        "allowBlank": bool(dv.allowBlank),
        "showErrorMessage": bool(dv.showErrorMessage),
        "errorStyle": dv.errorStyle,
    }


try:
    wb_formula = openpyxl.load_workbook(path, data_only=False)
    wb_value = openpyxl.load_workbook(path, data_only=True)

    report["sheetnames"] = list(wb_formula.sheetnames)
    report["vba"] = wb_formula.vba_archive is not None

    formulas = {}
    cached = {}
    for ws_formula, ws_value in zip(wb_formula.worksheets, wb_value.worksheets):
        for row in ws_formula.iter_rows():
            for cell in row:
                if cell.value is None:
                    continue
                key = "%s!%s" % (ws_formula.title, cell.coordinate)
                if isinstance(cell.value, str) and cell.value.startswith("="):
                    formulas[key] = cell.value
                cached[key] = scalar(ws_value[cell.coordinate].value)
    report["formulas"] = formulas
    report["cached"] = cached

    protection = {}
    locked = {}
    validations = {}
    validation_by_cell = {}
    for ws in wb_formula.worksheets:
        protection[ws.title] = {
            "sheet": bool(ws.protection.sheet),
            "password": ws.protection.password,
            "hashValue": ws.protection.hashValue,
            "algorithmName": ws.protection.algorithmName,
            "saltValue": ws.protection.saltValue,
        }
        locked[ws.title] = {
            cell.coordinate: bool(cell.protection.locked)
            for row in ws.iter_rows()
            for cell in row
        }
        records = [dv_record(dv) for dv in ws.data_validations.dataValidation]
        validations[ws.title] = records
        for coord in [
            "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10",
            "B11", "B12", "B13", "B14", "B15",
            "C2", "C3", "C4", "C5",
            "D2", "D3", "D4", "D5",
        ]:
            found = None
            for record in records:
                if coord in MultiCellRange(record["sqref"]):
                    found = record
                    break
            validation_by_cell["%s!%s" % (ws.title, coord)] = found

    report["protection"] = protection
    report["locked"] = locked
    report["validations"] = validations
    report["validation_by_cell"] = validation_by_cell

    import formulas as formulas_engine

    engine = formulas_engine.ExcelModel().loads(path).finish()
    solution = engine.calculate()
    calculated = {}
    for key, ranges in solution.items():
        match = re.match(r"^'?\[[^\]]*\](.+?)'?!([A-Z]+[0-9]+)$", key)
        if not match:
            continue
        calculated["%s!%s" % (match.group(1), match.group(2))] = scalar(ranges.value)
    report["calculated"] = calculated
    report["python"] = {
        "formulas": formulas_engine.__version__,
        "openpyxl": openpyxl.__version__,
    }
    report["ok"] = True
except Exception:
    report["error"] = traceback.format_exc()

print("<<<CALCULATOR_JSON>>>")
print(json.dumps(report, ensure_ascii=False, default=str))
print("<<<END_CALCULATOR_JSON>>>")
`;

type ValidationRecord = {
  sqref: string;
  type: string;
  operator: string | null;
  formula1: unknown;
  formula2: unknown;
  allowBlank: boolean;
  showErrorMessage: boolean;
  errorStyle: string | null;
};

type PythonReport = {
  ok: boolean;
  error?: string;
  sheetnames?: string[];
  vba?: boolean;
  formulas?: Record<string, string>;
  cached?: Record<string, unknown>;
  calculated?: Record<string, unknown>;
  protection?: Record<
    string,
    {
      sheet: boolean;
      password: string | null;
      hashValue: string | null;
      algorithmName: string | null;
      saltValue: string | null;
    }
  >;
  locked?: Record<string, Record<string, boolean>>;
  validations?: Record<string, ValidationRecord[]>;
  validation_by_cell?: Record<string, ValidationRecord | null>;
  python?: { formulas: string; openpyxl: string };
};

let passed = 0;
const failures: string[] = [];

function expect(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
    return;
  }
  const message = detail ? `${label} — ${detail}` : label;
  failures.push(message);
  console.log(`  FAIL  ${message}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function closeEnough(actual: unknown, expected: number, tolerance = 1e-6): boolean {
  const number = asNumber(actual);
  return number !== null && Math.abs(number - expected) <= tolerance;
}

function formatNumber(value: unknown): string {
  const number = asNumber(value);
  if (number === null) return String(value);
  return number.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** Copy a formula written for column B into another scenario column (independent of the builder). */
function shiftFormulaToColumn(formula: string, column: string): string {
  return formula.replace(
    /(\$?)([A-Z]{1,3})(\$?)(\d+)/g,
    (match: string, columnAbsolute: string, referenceColumn: string, rowAbsolute: string, row: string) => {
      if (columnAbsolute === "$") return match;
      if (referenceColumn !== "B") return match;
      return `${column}${rowAbsolute}${row}`;
    },
  );
}

const shared = costCases.shared;

type ScenarioValues = {
  questions: number;
  modelCalls: number;
  costPerCall: number;
  costPerQuestion: number;
  modelCost: number;
  fixedCost: number;
  subtotal: number;
  contingency: number;
  total: number;
  perQuestion: number;
};

function scenarioValues(users: number, calls: number): ScenarioValues {
  const questions = users * shared.questions_per_user_day * shared.days_per_month;
  const modelCalls = questions * calls;
  const costPerCall =
    ((shared.input_tokens * shared.input_usd_per_million +
      shared.output_tokens * shared.output_usd_per_million) /
      1_000_000) *
    shared.thb_per_usd;
  const costPerQuestion = calls * costPerCall + shared.other_variable_thb_question;
  const modelCost = questions * costPerQuestion;
  const fixedCost =
    shared.hosting_thb_month + shared.domain_thb_year / 12 + shared.other_fixed_thb_month;
  const subtotal = modelCost + fixedCost;
  const contingency = subtotal * shared.contingency_fraction;
  const total = subtotal + contingency;
  const perQuestion = questions === 0 ? 0 : total / questions;
  return {
    questions,
    modelCalls,
    costPerCall,
    costPerQuestion,
    modelCost,
    fixedCost,
    subtotal,
    contingency,
    total,
    perQuestion,
  };
}

const ROW_FIELD: Record<number, keyof ScenarioValues> = {
  7: "questions",
  8: "modelCalls",
  9: "costPerCall",
  10: "costPerQuestion",
  11: "modelCost",
  12: "fixedCost",
  13: "subtotal",
  14: "contingency",
  15: "total",
  16: "perQuestion",
};

const SCENARIO_EXPECTATIONS: Array<{ column: string; users: number; calls: number; id: string }> = [
  { column: "B", users: 100, calls: 1, id: "baseline" },
  { column: "C", users: 1000, calls: 1, id: "more_users" },
  { column: "D", users: 100, calls: 1.1, id: "retry" },
];

const ERROR_TOKENS = ["#DIV/0!", "#REF!", "#VALUE!", "#NAME?", "#N/A", "#NUM!", "#NULL!"];

const CHECKS_EXPECTATIONS: Array<{ row: number; expected: number; kind: "count" | "ratio" | "thb" }> = [
  { row: 2, expected: 11000, kind: "count" },
  { row: 3, expected: 0.14, kind: "ratio" },
  { row: 4, expected: 1540, kind: "thb" },
  { row: 5, expected: 350, kind: "thb" },
  { row: 6, expected: 1890, kind: "thb" },
  { row: 7, expected: 110000, kind: "count" },
  { row: 8, expected: 15750, kind: "thb" },
  { row: 9, expected: 12100, kind: "count" },
  { row: 10, expected: 1694, kind: "thb" },
  { row: 11, expected: 2044, kind: "thb" },
  { row: 12, expected: 350, kind: "thb" },
  { row: 13, expected: 0, kind: "thb" },
  { row: 14, expected: 3080, kind: "thb" },
  { row: 15, expected: 3430, kind: "thb" },
  { row: 16, expected: 350, kind: "thb" },
];

function main(): number {
  const workbookPath = path.resolve(process.cwd(), "public", "downloads", layout.filename);
  const pythonPath =
    process.env.CALCULATOR_PYTHON ??
    path.resolve(process.cwd(), ".tools", "venv", "bin", "python");

  console.log("calculator:check");
  console.log(`workbook: ${path.relative(process.cwd(), workbookPath)}`);

  if (!existsSync(workbookPath)) {
    console.error(`FAIL  workbook does not exist: ${workbookPath}`);
    console.error("      run: npm run calculator:build");
    return 1;
  }
  if (!existsSync(pythonPath)) {
    console.error(`FAIL  python venv not found: ${pythonPath}`);
    return 1;
  }

  const bytes = readFileSync(workbookPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  console.log(`sha256:   ${sha256}`);
  console.log(`bytes:    ${bytes.byteLength}`);

  const run = spawnSync(pythonPath, ["-c", PYTHON_SCRIPT, workbookPath], {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (run.error) {
    console.error(`FAIL  could not run python: ${run.error.message}`);
    return 1;
  }
  if (run.status !== 0) {
    console.error(`FAIL  python exited with status ${run.status}`);
    console.error(run.stderr);
    return 1;
  }

  const startMarker = "<<<CALCULATOR_JSON>>>";
  const endMarker = "<<<END_CALCULATOR_JSON>>>";
  const start = run.stdout.indexOf(startMarker);
  const end = run.stdout.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    console.error("FAIL  python did not print the JSON protocol payload");
    console.error(run.stdout);
    console.error(run.stderr);
    return 1;
  }

  let report: PythonReport;
  try {
    report = JSON.parse(run.stdout.slice(start + startMarker.length, end)) as PythonReport;
  } catch (error) {
    console.error("FAIL  could not parse python JSON");
    console.error(error);
    return 1;
  }

  if (!report.ok) {
    console.error("FAIL  python check script failed");
    console.error(report.error ?? "unknown error");
    return 1;
  }

  const cached = report.cached ?? {};
  const calculated = report.calculated ?? {};
  const formulas = report.formulas ?? {};

  const cachedAt = (sheet: string, address: string): unknown => cached[`${sheet}!${address}`];
  const calcAt = (sheet: string, address: string): unknown =>
    calculated[`${sheet.toUpperCase()}!${address}`];
  const formulaAt = (sheet: string, address: string): string | undefined =>
    formulas[`${sheet}!${address}`];

  section(`[environment] python ${report.python?.formulas ? `formulas ${report.python.formulas}, openpyxl ${report.python.openpyxl}` : ""}`);
  expect(
    "formulas engine is version 1.3.4",
    typeof report.python?.formulas === "string" && report.python.formulas.startsWith("1.3."),
    `got ${report.python?.formulas}`,
  );
  expect(
    "openpyxl is available",
    typeof report.python?.openpyxl === "string" && report.python.openpyxl.length > 0,
  );

  section("[1] workbook container");
  expect("workbook is a macro-free .xlsx (no VBA project)", report.vba === false);
  expect(
    `exactly four sheets in order ${layout.sheets.join(", ")}`,
    JSON.stringify(report.sheetnames) === JSON.stringify(layout.sheets),
    `got ${JSON.stringify(report.sheetnames)}`,
  );

  const allStrings = Object.values(cached)
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const startText = Object.entries(cached)
    .filter(([key]) => key.startsWith("Start!"))
    .map(([, value]) => String(value))
    .join("\n");

  section("[2] Start sheet");
  expect("Thai title is present", startText.includes("เครื่องคำนวณต้นทุนแอป AI"));
  expect("English title is present", startText.includes("AI App Cost Calculator"));
  expect("purpose section is present", startText.includes("จุดประสงค์ (purpose)"));
  expect(
    'required fictional-data label "ข้อมูลและราคาสมมติสำหรับการเรียน"',
    startText.includes("ข้อมูลและราคาสมมติสำหรับการเรียน"),
  );
  expect("how-to section is present", startText.includes("วิธีใช้ (how to use)"));
  for (let step = 1; step <= 5; step += 1) {
    expect(`how-to step ${step} exists`, startText.includes(`${step})`));
  }
  expect("sheet map section is present", startText.includes("แผนผังชีต (sheet map)"));
  for (const sheet of layout.sheets) {
    expect(`sheet map mentions ${sheet}`, startText.includes(sheet));
  }
  expect("limits section is present", startText.includes("ขอบเขตและข้อจำกัด (limits)"));
  expect("version 1.0.0 is present", startText.includes("1.0.0"));
  expect(
    "fictional teaching price warning is present",
    startText.includes("ราคาสมมติสำหรับการสอน") && startText.includes("fictional teaching prices"),
  );

  section("[3] Inputs values and labels");
  for (let row = 2; row <= 15; row += 1) {
    const address = `B${row}`;
    const expected = layout.input_defaults[address];
    expect(
      `Inputs!${address} = ${expected}`,
      closeEnough(cachedAt("Inputs", address), expected),
      `got ${formatNumber(cachedAt("Inputs", address))}`,
    );
  }
  for (let row = 2; row <= 15; row += 1) {
    expect(`Inputs!A${row} has a Thai label`, !isBlank(cachedAt("Inputs", `A${row}`)));
    expect(`Inputs!C${row} has a unit`, !isBlank(cachedAt("Inputs", `C${row}`)));
    expect(
      `Inputs!D${row} has an explanation`,
      !isBlank(cachedAt("Inputs", `D${row}`)),
    );
  }
  expect(
    'Inputs!B17 is the pricing label "ราคาสมมติสำหรับการสอน (fictional teaching prices)"',
    cachedAt("Inputs", "B17") === "ราคาสมมติสำหรับการสอน (fictional teaching prices)",
    `got ${JSON.stringify(cachedAt("Inputs", "B17"))}`,
  );
  expect("Inputs!B18 (price source) is blank", isBlank(cachedAt("Inputs", "B18")));
  expect("Inputs!B19 (price checked date) is blank", isBlank(cachedAt("Inputs", "B19")));
  expect(
    "Inputs!B20 lists the exclusions",
    String(cachedAt("Inputs", "B20") ?? "").includes(
      "บริการที่ยังไม่รวมในตาราง, ภาษี, และค่าบริการเพิ่มเติมของผู้ให้บริการ",
    ),
    `got ${JSON.stringify(cachedAt("Inputs", "B20"))}`,
  );

  section("[4] Inputs fixed-cost subtotal (THB 350, never a chat subscription)");
  expect(
    'Inputs!A16 uses the neutral label "ต้นทุนคงที่ต่อเดือน (fixed cost per month)"',
    cachedAt("Inputs", "A16") === "ต้นทุนคงที่ต่อเดือน (fixed cost per month)",
    `got ${JSON.stringify(cachedAt("Inputs", "A16"))}`,
  );
  expect(
    "Inputs!B16 formula is =B11+B12/12+B14",
    formulaAt("Inputs", "B16") === "=B11+B12/12+B14",
    `got ${JSON.stringify(formulaAt("Inputs", "B16"))}`,
  );
  expect(
    "Inputs!B16 cached result is 350",
    closeEnough(cachedAt("Inputs", "B16"), 350),
    `got ${formatNumber(cachedAt("Inputs", "B16"))}`,
  );
  for (const row of [11, 12, 13, 14]) {
    const explanation = String(cachedAt("Inputs", `D${row}`) ?? "");
    expect(
      `Inputs!D${row} explains 300 hosting + 50 domain = 350 fixed`,
      explanation.includes("350") && explanation.includes("300") && explanation.includes("50"),
      `got ${JSON.stringify(explanation)}`,
    );
  }
  expect(
    "the workbook never calls the fixed cost a subscription",
    !allStrings.toLowerCase().includes("subscription"),
  );

  section("[5] Scenarios layout");
  expect(
    "Scenarios!B1 header is baseline",
    String(cachedAt("Scenarios", "B1") ?? "").toLowerCase().includes("baseline"),
  );
  expect(
    "Scenarios!C1 header is 1,000 users",
    String(cachedAt("Scenarios", "C1") ?? "").includes("1,000 users"),
  );
  expect(
    "Scenarios!D1 header is 100 users with 1.1 calls",
    String(cachedAt("Scenarios", "D1") ?? "").includes("1.1"),
  );

  const inputCells: Array<[string, number]> = [
    ["B2", 100],
    ["C2", 1000],
    ["D2", 100],
    ["B3", 5],
    ["C3", 5],
    ["D3", 5],
    ["B4", 22],
    ["C4", 22],
    ["D4", 22],
    ["B5", 1],
    ["C5", 1],
    ["D5", 1.1],
  ];
  for (const [address, expected] of inputCells) {
    expect(
      `Scenarios!${address} = ${expected}`,
      closeEnough(cachedAt("Scenarios", address), expected),
      `got ${formatNumber(cachedAt("Scenarios", address))}`,
    );
    expect(`Scenarios!A${address.slice(1)} has a Thai label`, !isBlank(cachedAt("Scenarios", `A${address.slice(1)}`)));
  }

  section("[6] Scenarios formulas are exact (B7:B16 copied to C and D)");
  for (const scenario of SCENARIO_EXPECTATIONS) {
    for (let row = 7; row <= 16; row += 1) {
      const expectedFormula = shiftFormulaToColumn(layout.baseline_formulas[`B${row}`], scenario.column);
      expect(
        `Scenarios!${scenario.column}${row} formula`,
        formulaAt("Scenarios", `${scenario.column}${row}`) === expectedFormula,
        `expected ${expectedFormula}, got ${JSON.stringify(formulaAt("Scenarios", `${scenario.column}${row}`))}`,
      );
    }
  }

  section("[7] Scenarios results (recalculated by formulas 1.3.4)");
  const computedTable: string[] = [];
  for (const scenario of SCENARIO_EXPECTATIONS) {
    const expected = scenarioValues(scenario.users, scenario.calls);
    for (let row = 7; row <= 16; row += 1) {
      const field = ROW_FIELD[row];
      const address = `${scenario.column}${row}`;
      expect(
        `Scenarios!${address} (${scenario.id} ${field}) = ${formatNumber(expected[field])}`,
        closeEnough(calcAt("Scenarios", address), expected[field]),
        `got ${formatNumber(calcAt("Scenarios", address))}`,
      );
      expect(
        `Scenarios!${address} cached value matches the formula result`,
        closeEnough(cachedAt("Scenarios", address), expected[field]),
        `cached ${formatNumber(cachedAt("Scenarios", address))}`,
      );
    }
    computedTable.push(
      `  ${scenario.id.padEnd(10)} questions=${formatNumber(expected.questions)} calls=${formatNumber(expected.modelCalls)} perCall=${formatNumber(expected.costPerCall)} model=${formatNumber(expected.modelCost)} fixed=${formatNumber(expected.fixedCost)} total=${formatNumber(expected.total)} perQuestion=${formatNumber(expected.perQuestion)}`,
    );
  }

  section("[8] Checks sheet PASS/FAIL column and expected values");
  for (const check of CHECKS_EXPECTATIONS) {
    expect(
      `Checks!C${check.row} expected value = ${check.expected}`,
      closeEnough(cachedAt("Checks", `C${check.row}`), check.expected),
      `got ${formatNumber(cachedAt("Checks", `C${check.row}`))}`,
    );
    expect(
      `Checks!D${check.row} recalculated result is PASS`,
      calcAt("Checks", `D${check.row}`) === "PASS",
      `got ${JSON.stringify(calcAt("Checks", `D${check.row}`))}`,
    );
    expect(
      `Checks!D${check.row} cached result is PASS`,
      cachedAt("Checks", `D${check.row}`) === "PASS",
      `got ${JSON.stringify(cachedAt("Checks", `D${check.row}`))}`,
    );
  }

  for (let row = 2; row <= 16; row += 1) {
    expect(
      `Checks!B${row} is a formula referencing the model`,
      Boolean(formulaAt("Checks", `B${row}`)),
    );
    expect(
      `Checks!D${row} is a PASS/FAIL formula`,
      String(formulaAt("Checks", `D${row}`) ?? "").startsWith("=IF("),
    );
  }
  for (let row = 2; row <= 11; row += 1) {
    expect(
      `Checks!B${row} references the Scenarios sheet`,
      String(formulaAt("Checks", `B${row}`) ?? "").includes("Scenarios!"),
    );
  }
  expect(
    "Checks!B12 references the zero-user block (H10)",
    String(formulaAt("Checks", "B12") ?? "").includes("H10"),
  );
  expect(
    "Checks!B13 references the zero-user guard (H11)",
    String(formulaAt("Checks", "B13") ?? "").includes("H11"),
  );
  expect(
    "Checks!B14 references the FX x2 block (H16)",
    String(formulaAt("Checks", "B14") ?? "").includes("H16"),
  );
  expect(
    "Checks!B15 references the FX x2 block (H18)",
    String(formulaAt("Checks", "B15") ?? "").includes("H18"),
  );
  expect(
    "Checks!B16 references the FX x2 fixed cost (H17)",
    String(formulaAt("Checks", "B16") ?? "").includes("H17"),
  );
  expect(
    "zero-user total recalculates to 350",
    closeEnough(calcAt("Checks", "B12"), 350),
    `got ${formatNumber(calcAt("Checks", "B12"))}`,
  );
  expect(
    "zero-user per-question guard recalculates to 0",
    closeEnough(calcAt("Checks", "B13"), 0),
    `got ${formatNumber(calcAt("Checks", "B13"))}`,
  );
  expect(
    "FX x2 model cost recalculates to 3,080",
    closeEnough(calcAt("Checks", "B14"), 3080),
    `got ${formatNumber(calcAt("Checks", "B14"))}`,
  );
  expect(
    "FX x2 total recalculates to 3,430",
    closeEnough(calcAt("Checks", "B15"), 3430),
    `got ${formatNumber(calcAt("Checks", "B15"))}`,
  );
  expect(
    "FX x2 fixed cost stays 350",
    closeEnough(calcAt("Checks", "B16"), 350),
    `got ${formatNumber(calcAt("Checks", "B16"))}`,
  );

  const checksNote = String(cachedAt("Checks", "A20") ?? "");
  expect(
    "Checks note says a spreadsheet does not enforce an API budget",
    checksNote.includes("a spreadsheet does not enforce an API budget"),
    `got ${JSON.stringify(checksNote)}`,
  );
  for (const term of [
    "cache pricing",
    "reasoning tokens",
    "tools",
    "embeddings",
    "storage",
    "network",
    "context tiers",
    "taxes",
  ]) {
    expect(`Checks note mentions ${term}`, checksNote.toLowerCase().includes(term));
  }

  section("[9] No formula errors anywhere");
  const errorHits: string[] = [];
  for (const [key, value] of Object.entries({ ...cached, ...calculated })) {
    if (typeof value === "string") {
      for (const token of ERROR_TOKENS) {
        if (value.includes(token)) errorHits.push(`${key}=${value}`);
      }
    }
  }
  expect(
    `no ${ERROR_TOKENS.join(" / ")} values in any cell`,
    errorHits.length === 0,
    errorHits.slice(0, 10).join(", "),
  );
  expect(
    "zero-user guard avoids #DIV/0!",
    calcAt("Checks", "D13") === "PASS",
    `got ${JSON.stringify(calcAt("Checks", "D13"))}`,
  );

  section("[10] Sheet protection and unlocked inputs (openpyxl)");
  for (const sheet of ["Inputs", "Scenarios"]) {
    const protection = report.protection?.[sheet];
    expect(`${sheet} sheet protection is ON`, protection?.sheet === true);
    expect(
      `${sheet} protection has no password or hash`,
      (protection?.password ?? null) === null &&
        (protection?.hashValue ?? null) === null &&
        (protection?.algorithmName ?? null) === null &&
        (protection?.saltValue ?? null) === null,
      JSON.stringify(protection),
    );
  }

  for (let row = 2; row <= 15; row += 1) {
    expect(
      `Inputs!B${row} is unlocked`,
      report.locked?.Inputs?.[`B${row}`] === false,
      `locked=${String(report.locked?.Inputs?.[`B${row}`])}`,
    );
  }
  for (const column of ["B", "C", "D"]) {
    for (let row = 2; row <= 5; row += 1) {
      expect(
        `Scenarios!${column}${row} is unlocked`,
        report.locked?.Scenarios?.[`${column}${row}`] === false,
        `locked=${String(report.locked?.Scenarios?.[`${column}${row}`])}`,
      );
    }
  }
  for (const column of ["B", "C", "D"]) {
    for (let row = 7; row <= 16; row += 1) {
      expect(
        `Scenarios!${column}${row} formula cell is locked`,
        report.locked?.Scenarios?.[`${column}${row}`] === true,
        `locked=${String(report.locked?.Scenarios?.[`${column}${row}`])}`,
      );
    }
  }
  expect("Inputs!B16 formula cell is locked", report.locked?.Inputs?.B16 === true);

  section("[11] Data validation rejects text and negative values");
  const validationExpectations: Array<{
    cell: string;
    type: "whole" | "decimal";
    operator: "greaterThanOrEqual" | "between" | "greaterThan";
    formula1: string;
    formula2?: string;
  }> = [
    { cell: "Inputs!B2", type: "whole", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B3", type: "whole", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B4", type: "whole", operator: "between", formula1: "0", formula2: "31" },
    { cell: "Inputs!B5", type: "decimal", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B6", type: "whole", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B7", type: "whole", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B8", type: "decimal", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B9", type: "decimal", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B10", type: "decimal", operator: "greaterThan", formula1: "0" },
    { cell: "Inputs!B11", type: "decimal", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B12", type: "decimal", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B13", type: "decimal", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B14", type: "decimal", operator: "greaterThanOrEqual", formula1: "0" },
    { cell: "Inputs!B15", type: "decimal", operator: "between", formula1: "0", formula2: "1" },
  ];
  for (const column of ["B", "C", "D"]) {
    validationExpectations.push(
      { cell: `Scenarios!${column}2`, type: "whole", operator: "greaterThanOrEqual", formula1: "0" },
      { cell: `Scenarios!${column}3`, type: "whole", operator: "greaterThanOrEqual", formula1: "0" },
      { cell: `Scenarios!${column}4`, type: "whole", operator: "between", formula1: "0", formula2: "31" },
      { cell: `Scenarios!${column}5`, type: "decimal", operator: "greaterThanOrEqual", formula1: "0" },
    );
  }

  for (const expectation of validationExpectations) {
    const record = report.validation_by_cell?.[expectation.cell];
    const formula1 = String(record?.formula1 ?? "");
    const formula2 = String(record?.formula2 ?? "");
    expect(
      `${expectation.cell} has ${expectation.type} validation ${expectation.operator} ${expectation.formula1}${expectation.formula2 ? `..${expectation.formula2}` : ""}`,
      record?.type === expectation.type &&
        record?.operator === expectation.operator &&
        formula1 === expectation.formula1 &&
        (expectation.formula2 === undefined || formula2 === expectation.formula2) &&
        record?.showErrorMessage === true &&
        record?.errorStyle === "stop",
      JSON.stringify(record),
    );
  }

  section("[12] Every formula cell has a cached result (workbook shows values immediately)");
  const calculatedByKey = new Map(
    Object.entries(calculated).map(([key, value]) => [key.toUpperCase(), value]),
  );
  const formulaKeys = Object.keys(formulas);
  for (const key of formulaKeys) {
    const cachedValue = cached[key];
    const recalculated = calculatedByKey.get(key.toUpperCase());
    const cachedNumber = asNumber(cachedValue);
    const recalculatedNumber = asNumber(recalculated);
    const matches =
      cachedNumber !== null && recalculatedNumber !== null
        ? closeEnough(cachedNumber, recalculatedNumber)
        : String(cachedValue) === String(recalculated);
    expect(
      `${key} has a cached result matching the formula`,
      !isBlank(cachedValue) && matches,
      `cached=${JSON.stringify(cachedValue)} recalculated=${JSON.stringify(recalculated)}`,
    );
  }
  expect("workbook contains formulas", formulaKeys.length > 0);
  console.log(`  formula cells checked: ${formulaKeys.length}`);

  section("[summary]");
  console.log("Scenarios recalculated by the `formulas` engine:");
  for (const line of computedTable) console.log(line);
  console.log("");
  console.log(`checks passed: ${passed}`);
  console.log(`checks failed: ${failures.length}`);
  console.log(`sha256: ${sha256}`);

  if (failures.length > 0) {
    console.log("\nFAILURES");
    for (const failure of failures) console.log(` - ${failure}`);
    console.log("\nRESULT: FAIL");
    return 1;
  }

  console.log("\nRESULT: PASS");
  return 0;
}

// Set the exit code instead of calling process.exit() so piped output flushes.
process.exitCode = main();
