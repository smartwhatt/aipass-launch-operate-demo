import { roundThb4 } from "@/lib/calculator/teaching-prices";

/**
 * The calculator formulas, shared by the browser view and the tests.
 * These mirror the Excel Scenarios sheet exactly (B7..B16 on every column).
 */

export type CalculatorInputs = {
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
  /** 0..1 */
  contingency: number;
};

export type CalculatorResult = {
  questionsPerMonth: number;
  modelCalls: number;
  costPerCallThb: number;
  modelCostThb: number;
  variablePerQuestionThb: number;
  totalVariableThb: number;
  fixedCostThb: number;
  subtotalThb: number;
  contingencyThb: number;
  totalThb: number;
  perQuestionThb: number;
  perQuestionMeaningful: boolean;
};

export const CALCULATOR_DEFAULTS: CalculatorInputs = {
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

export function calculateCost(inputs: CalculatorInputs): CalculatorResult {
  // Scenarios!B7
  const questionsPerMonth = inputs.users * inputs.questionsPerDay * inputs.activeDays;
  // Scenarios!B8
  // Excel evaluates 11000*1.1 as 12100.000000000002; round the count the same way.
  const modelCalls = roundThb4(questionsPerMonth * inputs.callsPerQuestion);
  // Scenarios!B9
  const costPerCallThb = roundThb4(
    ((inputs.inputTokens * inputs.inputUsdPerMillion +
      inputs.outputTokens * inputs.outputUsdPerMillion) /
      1_000_000) *
      inputs.thbPerUsd,
  );
  // Scenarios!B10
  const variablePerQuestionThb = roundThb4(
    inputs.callsPerQuestion * costPerCallThb + inputs.otherVariableThbQuestion,
  );
  // Scenarios!B11
  const totalVariableThb = roundThb4(questionsPerMonth * variablePerQuestionThb);
  // Scenarios!B12
  const fixedCostThb = roundThb4(
    inputs.hostingThbMonth + inputs.domainThbYear / 12 + inputs.otherFixedThbMonth,
  );
  // Scenarios!B13
  const subtotalThb = roundThb4(totalVariableThb + fixedCostThb);
  // Scenarios!B14
  const contingencyThb = roundThb4(subtotalThb * inputs.contingency);
  // Scenarios!B15
  const totalThb = roundThb4(subtotalThb + contingencyThb);
  // Scenarios!B16 — zero only prevents a division error, the figure is meaningless.
  const perQuestionThb = questionsPerMonth === 0 ? 0 : roundThb4(totalThb / questionsPerMonth);

  return {
    questionsPerMonth,
    modelCalls,
    costPerCallThb,
    modelCostThb: totalVariableThb,
    variablePerQuestionThb,
    totalVariableThb,
    fixedCostThb,
    subtotalThb,
    contingencyThb,
    totalThb,
    perQuestionThb,
    perQuestionMeaningful: questionsPerMonth > 0,
  };
}

export type ValidationIssue = { field: string; message: string };

/** The same rules the workbook enforces with data validation. */
export function validateCalculatorInputs(inputs: CalculatorInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nonNegativeInteger = (field: string, value: number, label: string) => {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      issues.push({ field, message: `${label}ต้องเป็นจำนวนเต็มไม่ติดลบ` });
    }
  };

  nonNegativeInteger("users", inputs.users, "จำนวนผู้ใช้");
  if (!Number.isFinite(inputs.questionsPerDay) || inputs.questionsPerDay < 0) {
    issues.push({ field: "questionsPerDay", message: "คำถามต่อวันต้องไม่ติดลบ" });
  }
  nonNegativeInteger("activeDays", inputs.activeDays, "วันทำการต่อเดือน");
  if (inputs.activeDays > 31) {
    issues.push({ field: "activeDays", message: "วันทำการต่อเดือนต้องไม่เกิน 31" });
  }
  if (!Number.isFinite(inputs.callsPerQuestion) || inputs.callsPerQuestion < 0) {
    issues.push({ field: "callsPerQuestion", message: "จำนวนการเรียกต่อคำถามต้องไม่ติดลบ" });
  }
  nonNegativeInteger("inputTokens", inputs.inputTokens, "จำนวน token เข้า");
  nonNegativeInteger("outputTokens", inputs.outputTokens, "จำนวน token ออก");
  for (const [field, value, label] of [
    ["inputUsdPerMillion", inputs.inputUsdPerMillion, "ราคา token เข้า"],
    ["outputUsdPerMillion", inputs.outputUsdPerMillion, "ราคา token ออก"],
    ["hostingThbMonth", inputs.hostingThbMonth, "ค่า hosting"],
    ["domainThbYear", inputs.domainThbYear, "ค่าโดเมน"],
    ["otherVariableThbQuestion", inputs.otherVariableThbQuestion, "ค่าใช้จ่ายผันแปรอื่น"],
    ["otherFixedThbMonth", inputs.otherFixedThbMonth, "ค่าใช้จ่ายคงที่อื่น"],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      issues.push({ field, message: `${label}ต้องไม่ติดลบ` });
    }
  }
  if (!Number.isFinite(inputs.thbPerUsd) || inputs.thbPerUsd <= 0) {
    issues.push({ field: "thbPerUsd", message: "อัตราแลกเปลี่ยนต้องมากกว่า 0" });
  }
  if (inputs.contingency < 0 || inputs.contingency > 1) {
    issues.push({ field: "contingency", message: "เงินสำรองต้องอยู่ระหว่าง 0% และ 100%" });
  }
  return issues;
}
