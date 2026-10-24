/**
 * Offline Excel cost calculator.
 *
 * Contract: IMPLEMENTATION_SPEC.md section 11 and fixtures/calculator-layout.json.
 * The workbook is macro-free, has exactly four sheets (Start, Inputs, Scenarios,
 * Checks), keeps every formula's cached result so the values show before Excel
 * recalculates, and protects only the two sheets that hold formulas.
 *
 * Teaching prices are fictional. They come from fixtures/cost-cases.json and
 * never describe a real provider.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import calculatorLayout from "@/fixtures/calculator-layout.json";
import costCases from "@/fixtures/cost-cases.json";

const layout = calculatorLayout as unknown as {
  filename: string;
  sheets: string[];
  input_defaults: Record<string, number>;
  baseline_formulas: Record<string, string>;
};

export const CALCULATOR_FILENAME = layout.filename;
export const CALCULATOR_SHEETS = ["Start", "Inputs", "Scenarios", "Checks"] as const;

const COUNT_FORMAT = "#,##0";
const THB_FORMAT = "#,##0.00";
const PER_CALL_FORMAT = "#,##0.0000";
const RATE_FORMAT = "#,##0.0";
const PERCENT_FORMAT = "0%";
const THAI_TEXT_FORMAT = "@";

const HEADER_FILL = "FF1F4E79";
const SECTION_FILL = "FFDDEBF7";
const INPUT_FILL = "FFFFF2CC";
const FORMULA_FILL = "FFE2EFDA";
const WARNING_FILL = "FFFCE4D6";
const NOTE_FILL = "FFF2F2F2";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFBFBFBF" } },
  left: { style: "thin", color: { argb: "FFBFBFBF" } },
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  right: { style: "thin", color: { argb: "FFBFBFBF" } },
};

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function styleHeaderRow(worksheet: ExcelJS.Worksheet, row: number, lastColumn: number): void {
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = worksheet.getCell(row, column);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = solid(HEADER_FILL);
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = THIN_BORDER;
  }
  worksheet.getRow(row).height = 30;
}

function styleSection(
  worksheet: ExcelJS.Worksheet,
  row: number,
  text: string,
  lastColumn: number,
): void {
  worksheet.mergeCells(row, 1, row, lastColumn);
  const cell = worksheet.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size: 12, color: { argb: "FF1F3864" } };
  cell.fill = solid(SECTION_FILL);
  cell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(row).height = 22;
}

function styleMergedText(
  worksheet: ExcelJS.Worksheet,
  row: number,
  text: string,
  lastColumn: number,
  options: {
    height?: number;
    bold?: boolean;
    fill?: string;
    italic?: boolean;
    color?: string;
    size?: number;
  } = {},
): void {
  worksheet.mergeCells(row, 1, row, lastColumn);
  const cell = worksheet.getCell(row, 1);
  cell.value = text;
  cell.font = {
    bold: options.bold ?? false,
    italic: options.italic ?? false,
    size: options.size ?? 11,
    color: { argb: options.color ?? "FF1F1F1F" },
  };
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  if (options.fill) {
    cell.fill = solid(options.fill);
  }
  if (options.height) {
    worksheet.getRow(row).height = options.height;
  }
}

type ScenarioResult = {
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

const shared = costCases.shared;

const COST_PER_CALL =
  ((shared.input_tokens * shared.input_usd_per_million +
    shared.output_tokens * shared.output_usd_per_million) /
    1_000_000) *
  shared.thb_per_usd;

const FIXED_COST =
  shared.hosting_thb_month + shared.domain_thb_year / 12 + shared.other_fixed_thb_month;

function computeScenario(users: number, questionsPerUserDay: number, days: number, calls: number): ScenarioResult {
  const questions = users * questionsPerUserDay * days;
  const modelCalls = questions * calls;
  const costPerQuestion = calls * COST_PER_CALL + shared.other_variable_thb_question;
  const modelCost = questions * costPerQuestion;
  const fixedCost = FIXED_COST;
  const subtotal = modelCost + fixedCost;
  const contingency = subtotal * shared.contingency_fraction;
  const total = subtotal + contingency;
  const perQuestion = questions === 0 ? 0 : total / questions;

  return {
    questions,
    modelCalls,
    costPerCall: COST_PER_CALL,
    costPerQuestion,
    modelCost,
    fixedCost,
    subtotal,
    contingency,
    total,
    perQuestion,
  };
}

const RESULT_FIELD_BY_ROW: Record<number, keyof ScenarioResult> = {
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

const RESULT_FORMAT_BY_ROW: Record<number, string> = {
  7: COUNT_FORMAT,
  8: COUNT_FORMAT,
  9: PER_CALL_FORMAT,
  10: PER_CALL_FORMAT,
  11: THB_FORMAT,
  12: THB_FORMAT,
  13: THB_FORMAT,
  14: THB_FORMAT,
  15: THB_FORMAT,
  16: PER_CALL_FORMAT,
};

/**
 * Copy a formula written for column B into another scenario column.
 *
 * Only relative references to column B are shifted. Absolute references (for
 * example Inputs!$B$6) are shared prices and must stay fixed.
 */
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

function formulaBody(formula: string): string {
  return formula.startsWith("=") ? formula.slice(1) : formula;
}

function setFormulaCell(
  worksheet: ExcelJS.Worksheet,
  address: string,
  formula: string,
  result: number | string,
  numFmt?: string,
): void {
  const cell = worksheet.getCell(address);
  cell.value = { formula: formulaBody(formula), result };
  cell.fill = solid(FORMULA_FILL);
  cell.border = THIN_BORDER;
  if (numFmt) cell.numFmt = numFmt;
}

function addValidation(
  worksheet: ExcelJS.Worksheet,
  range: string,
  validation: ExcelJS.DataValidation,
): void {
  // ExcelJS ships dataValidations at runtime but omits it from its typings.
  const collection = (
    worksheet as unknown as {
      dataValidations: { add(address: string, value: ExcelJS.DataValidation): void };
    }
  ).dataValidations;
  collection.add(range, validation);
}

function wholeAtLeastZero(title: string, message: string): ExcelJS.DataValidation {
  return {
    type: "whole",
    operator: "greaterThanOrEqual",
    formulae: [0],
    allowBlank: false,
    showErrorMessage: true,
    showInputMessage: true,
    errorStyle: "stop",
    errorTitle: title,
    error: message,
    promptTitle: title,
    prompt: message,
  };
}

function decimalAtLeastZero(title: string, message: string): ExcelJS.DataValidation {
  return {
    type: "decimal",
    operator: "greaterThanOrEqual",
    formulae: [0],
    allowBlank: false,
    showErrorMessage: true,
    showInputMessage: true,
    errorStyle: "stop",
    errorTitle: title,
    error: message,
    promptTitle: title,
    prompt: message,
  };
}

function buildStartSheet(workbook: ExcelJS.Workbook): void {
  const worksheet = workbook.addWorksheet("Start", {
    views: [{ showGridLines: false }],
  });

  worksheet.getColumn(1).width = 30;
  worksheet.getColumn(2).width = 24;
  worksheet.getColumn(3).width = 24;
  worksheet.getColumn(4).width = 16;
  worksheet.getColumn(5).width = 14;
  worksheet.getColumn(6).width = 14;

  worksheet.mergeCells("A1:F1");
  const title = worksheet.getCell("A1");
  title.value = "เครื่องคำนวณต้นทุนแอป AI (AI App Cost Calculator)";
  title.font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  title.fill = solid(HEADER_FILL);
  title.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  worksheet.getRow(1).height = 34;

  styleMergedText(
    worksheet,
    2,
    "AIPASS · Launch & Operate Your AI App · เวอร์ชัน 1.0.0 · ไฟล์ .xlsx ไม่มีมาโคร ใช้ได้แบบออฟไลน์",
    6,
    { italic: true, color: "FF595959", height: 20 },
  );

  styleSection(worksheet, 4, "จุดประสงค์ (purpose)", 6);
  styleMergedText(
    worksheet,
    5,
    "ใช้ประมาณต้นทุนรายเดือนของแอป AI จากจำนวนผู้ใช้ จำนวนคำถาม จำนวนการเรียกโมเดล และราคาโทเคน เพื่อให้เห็นว่าต้นทุนมาจากส่วนใด และตัวเลขเปลี่ยนอย่างไรเมื่อสมมติฐานเปลี่ยน",
    6,
    { height: 34 },
  );

  worksheet.mergeCells("A6:F6");
  const fictionalLabel = worksheet.getCell("A6");
  fictionalLabel.value = "ข้อมูลและราคาสมมติสำหรับการเรียน";
  fictionalLabel.font = { bold: true, size: 13, color: { argb: "FF833C0B" } };
  fictionalLabel.fill = solid(WARNING_FILL);
  fictionalLabel.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(6).height = 24;

  styleMergedText(
    worksheet,
    7,
    "ราคาทั้งหมดในไฟล์นี้เป็นราคาสมมติสำหรับการสอน (fictional teaching prices) ไม่ใช่ราคาจริงของผู้ให้บริการรายใด และห้ามใช้เป็นใบเสนอราคา",
    6,
    { bold: true, fill: WARNING_FILL, color: "FF833C0B", height: 30 },
  );

  styleSection(worksheet, 9, "วิธีใช้ (how to use)", 6);
  const steps = [
    "1) เปิดชีต Inputs แล้วแก้เฉพาะช่องสีเหลือง B2:B15 (ค่าเริ่มต้น: 100 ผู้ใช้, 5 คำถาม/คน/วัน, 22 วัน/เดือน, 1 การเรียก/คำถาม)",
    "2) เปิดชีต Scenarios เพื่อดูสามกรณี: baseline, 1,000 users และ 100 users with 1.1 calls (retry)",
    "3) แก้จำนวนผู้ใช้/คำถาม/วัน/การเรียกใน Scenarios B2:D5 ได้ สูตรในแถว 7-16 จะคำนวณใหม่",
    "4) ใส่ราคาโทเคนจริงใน Inputs B6:B10 และต้นทุนคงที่ B11:B15 เมื่อต้องการประมาณการจริง แล้วอัปเดตป้ายราคา B17, แหล่งที่มา B18 และวันที่ตรวจสอบ B19",
    "5) เปิดชีต Checks เพื่อดูผล PASS/FAIL ของค่าอ้างอิง และอ่านหมายเหตุเรื่องขอบเขตของสเปรดชีต",
  ];
  steps.forEach((step, index) => {
    styleMergedText(worksheet, 10 + index, step, 6, { height: 24 });
  });

  styleSection(worksheet, 16, "แผนผังชีต (sheet map)", 6);
  const sheetMap: Array<[string, string]> = [
    ["Start", "คำแนะนำ จุดประสงค์ แผนผังชีต และข้อจำกัดของไฟล์นี้"],
    ["Inputs", "ค่าที่แก้ได้: ผู้ใช้ จำนวนคำถาม โทเคน ราคา อัตราแลกเปลี่ยน และต้นทุนคงที่"],
    ["Scenarios", "สูตรต้นทุนสามกรณี พร้อมผลลัพธ์ที่คำนวณไว้แล้ว"],
    ["Checks", "ตรวจสอบค่าอ้างอิงด้วยสูตร PASS/FAIL และหมายเหตุสำคัญ"],
  ];
  sheetMap.forEach(([sheet, description], index) => {
    const row = 17 + index;
    worksheet.getCell(`A${row}`).value = sheet;
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.mergeCells(`B${row}:F${row}`);
    worksheet.getCell(`B${row}`).value = description;
    worksheet.getCell(`B${row}`).alignment = { vertical: "top", horizontal: "left", wrapText: true };
    worksheet.getRow(row).height = 22;
  });

  styleSection(worksheet, 22, "ขอบเขตและข้อจำกัด (limits)", 6);
  styleMergedText(
    worksheet,
    23,
    "สเปรดชีตไม่ได้บังคับงบประมาณ API (a spreadsheet does not enforce an API budget) ใบเรียกเก็บจริงอาจมีค่าแคช (cache pricing), reasoning tokens, tools, embeddings, storage, network, context tiers, taxes และราคาที่ต่างจากนี้",
    6,
    { height: 44 },
  );
  styleMergedText(
    worksheet,
    24,
    "ตัวเลขเป็นแบบจำลองจากสมมติฐาน ไม่ใช่การพยากรณ์ยอดจริง และไม่รวมบริการที่ยังไม่ระบุในตาราง",
    6,
    { height: 22 },
  );
  styleMergedText(
    worksheet,
    25,
    "ต้นทุนคงที่ต่อเดือน (fixed cost per month) 350 บาท = ค่าโฮสติ้ง 300 บาท + ค่าโดเมน 600/12 = 50 บาท; ไม่ใช่ค่าบริการแชท",
    6,
    { height: 22 },
  );

  styleMergedText(
    worksheet,
    27,
    "เวอร์ชัน (version) 1.0.0 · ไฟล์: AIPASS_AI_App_Cost_Calculator_v1.xlsx · สร้างโดย tools/calculator-build.ts",
    6,
    { italic: true, color: "FF595959", height: 20 },
  );
  styleMergedText(
    worksheet,
    28,
    "ไฟล์นี้ไม่มีมาโคร (macro-free) และไม่เรียกข้อมูลจากเครือข่าย เปิดได้ใน Excel แบบออฟไลน์",
    6,
    { italic: true, color: "FF595959", height: 20 },
  );
}

type InputRow = {
  row: number;
  label: string;
  unit: string;
  explanation: string;
  format: string;
};

function buildInputsSheet(workbook: ExcelJS.Workbook): void {
  const worksheet = workbook.addWorksheet("Inputs", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.getColumn(1).width = 54;
  worksheet.getColumn(2).width = 16;
  worksheet.getColumn(3).width = 16;
  worksheet.getColumn(4).width = 84;

  worksheet.getCell("A1").value = "ข้อมูลนำเข้า (inputs) — แก้ไขช่องสีเหลือง";
  worksheet.getCell("B1").value = "ค่า (value)";
  worksheet.getCell("C1").value = "หน่วย (unit)";
  worksheet.getCell("D1").value = "คำอธิบาย (explanation)";
  styleHeaderRow(worksheet, 1, 4);

  const rows: InputRow[] = [
    {
      row: 2,
      label: "จำนวนผู้ใช้ (users)",
      unit: "คน (users)",
      explanation: "จำนวนผู้ใช้ที่ใช้งานต่อเดือน; ช่องสีเหลืองแก้ได้",
      format: COUNT_FORMAT,
    },
    {
      row: 3,
      label: "จำนวนคำถามต่อผู้ใช้ต่อวัน (questions/user/day)",
      unit: "คำถาม/คน/วัน",
      explanation: "จำนวนคำถามโดยเฉลี่ยต่อผู้ใช้หนึ่งคนต่อวัน",
      format: COUNT_FORMAT,
    },
    {
      row: 4,
      label: "จำนวนวันใช้งานต่อเดือน (active days/month)",
      unit: "วัน/เดือน",
      explanation: "จำนวนวันที่แอปถูกใช้งานต่อเดือน (0-31)",
      format: COUNT_FORMAT,
    },
    {
      row: 5,
      label: "จำนวนการเรียกโมเดลเฉลี่ยต่อคำถาม (average calls/question)",
      unit: "ครั้ง/คำถาม",
      explanation: "1 = หนึ่งการเรียกโมเดลต่อหนึ่งคำถาม; 1.1 = มีการลองใหม่ (retry) ประมาณ 10%",
      format: RATE_FORMAT,
    },
    {
      row: 6,
      label: "จำนวนโทเคนขาเข้าต่อครั้ง (input tokens/call)",
      unit: "โทเคน (tokens)",
      explanation: "จำนวนโทเคนขาเข้าต่อการเรียกหนึ่งครั้ง (ค่าสมมติสำหรับการสอน)",
      format: COUNT_FORMAT,
    },
    {
      row: 7,
      label: "จำนวนโทเคนขาออกต่อครั้ง (output tokens/call)",
      unit: "โทเคน (tokens)",
      explanation: "จำนวนโทเคนขาออกต่อการเรียกหนึ่งครั้ง (ค่าสมมติสำหรับการสอน)",
      format: COUNT_FORMAT,
    },
    {
      row: 8,
      label: "ราคาโทเคนขาเข้า (input USD per million tokens)",
      unit: "USD/1M tokens",
      explanation: "ราคาสมมติ USD ต่อ 1 ล้านโทเคนขาเข้า",
      format: THB_FORMAT,
    },
    {
      row: 9,
      label: "ราคาโทเคนขาออก (output USD per million tokens)",
      unit: "USD/1M tokens",
      explanation: "ราคาสมมติ USD ต่อ 1 ล้านโทเคนขาออก",
      format: THB_FORMAT,
    },
    {
      row: 10,
      label: "อัตราแลกเปลี่ยน (exchange rate THB per USD)",
      unit: "บาท/USD",
      explanation: "อัตราแลกเปลี่ยนบาทต่อดอลลาร์สหรัฐ; ต้องมากกว่า 0",
      format: RATE_FORMAT,
    },
    {
      row: 11,
      label: "ค่าโฮสติ้งต่อเดือน (hosting THB/month)",
      unit: "บาท/เดือน",
      explanation:
        "ค่าโฮสติ้ง 300 บาท/เดือน เป็นส่วนหนึ่งของต้นทุนคงที่ 350 บาท/เดือน (= 300 + 50) ไม่ใช่ค่าบริการแชท",
      format: THB_FORMAT,
    },
    {
      row: 12,
      label: "ค่าโดเมนต่อปี (domain THB/year)",
      unit: "บาท/ปี",
      explanation:
        "ค่าโดเมน 600 บาท/ปี หาร 12 = 50 บาท/เดือน; 300 + 50 = 350 บาท/เดือน (ต้นทุนคงที่) ไม่ใช่ค่าบริการแชท",
      format: THB_FORMAT,
    },
    {
      row: 13,
      label: "ต้นทุนผันแปรอื่น ๆ ต่อคำถาม (other variable THB/question)",
      unit: "บาท/คำถาม",
      explanation:
        "ต้นทุนผันแปรอื่น ๆ ต่อคำถาม (เช่น ค่าบริการเสริมของผู้ให้บริการ); ไม่กระทบต้นทุนคงที่ 350 บาท/เดือน (= 300 ค่าโฮสติ้ง + 50 ค่าโดเมน)",
      format: THB_FORMAT,
    },
    {
      row: 14,
      label: "ต้นทุนคงที่อื่น ๆ ต่อเดือน (other fixed THB/month)",
      unit: "บาท/เดือน",
      explanation:
        "ต้นทุนคงที่อื่น ๆ ต่อเดือน; รวมกับ 300 ค่าโฮสติ้ง และ 600/12 = 50 ค่าโดเมน เป็น 350 บาท/เดือน",
      format: THB_FORMAT,
    },
    {
      row: 15,
      label: "เงินสำรองเผื่อฉุกเฉิน (contingency fraction)",
      unit: "%",
      explanation: "0% = ไม่กันเงินสำรอง; 0.1 = กัน 10%; กรอกได้ตั้งแต่ 0 ถึง 1",
      format: PERCENT_FORMAT,
    },
  ];

  for (const row of rows) {
    const labelCell = worksheet.getCell(`A${row.row}`);
    labelCell.value = row.label;
    labelCell.font = { bold: row.row <= 15 };
    labelCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    labelCell.border = THIN_BORDER;

    const valueCell = worksheet.getCell(`B${row.row}`);
    valueCell.value = layout.input_defaults[`B${row.row}`];
    valueCell.numFmt = row.format;
    valueCell.fill = solid(INPUT_FILL);
    valueCell.border = THIN_BORDER;
    valueCell.alignment = { vertical: "middle", horizontal: "right" };
    valueCell.protection = { locked: false };

    const unitCell = worksheet.getCell(`C${row.row}`);
    unitCell.value = row.unit;
    unitCell.border = THIN_BORDER;
    unitCell.alignment = { vertical: "middle", horizontal: "left" };

    const explanationCell = worksheet.getCell(`D${row.row}`);
    explanationCell.value = row.explanation;
    explanationCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    explanationCell.border = THIN_BORDER;
    explanationCell.font = { color: { argb: "FF404040" } };

    worksheet.getRow(row.row).height = 30;
  }

  worksheet.getCell("A16").value = "ต้นทุนคงที่ต่อเดือน (fixed cost per month)";
  worksheet.getCell("A16").font = { bold: true };
  worksheet.getCell("A16").border = THIN_BORDER;
  worksheet.getCell("A16").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  setFormulaCell(worksheet, "B16", "=B11+B12/12+B14", FIXED_COST, THB_FORMAT);
  worksheet.getCell("C16").value = "บาท/เดือน";
  worksheet.getCell("C16").border = THIN_BORDER;
  worksheet.getCell("D16").value =
    "สูตร = 300 (ค่าโฮสติ้ง) + 600/12 (ค่าโดเมน 50) + 0 = 350 บาท/เดือน; เป็นต้นทุนคงที่ ไม่ใช่ค่าบริการแชท";
  worksheet.getCell("D16").border = THIN_BORDER;
  worksheet.getCell("D16").alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  worksheet.getRow(16).height = 34;

  const textRows: Array<[number, string, string]> = [
    [17, "ป้ายราคา (pricing label)", "ราคาสมมติสำหรับการสอน (fictional teaching prices)"],
    [18, "แหล่งที่มาของราคา (price source)", ""],
    [19, "วันที่ตรวจสอบราคา (price checked date)", ""],
    [20, "ข้อยกเว้น (exclusions)", "บริการที่ยังไม่รวมในตาราง, ภาษี, และค่าบริการเพิ่มเติมของผู้ให้บริการ"],
  ];
  for (const [row, label, value] of textRows) {
    worksheet.getCell(`A${row}`).value = label;
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`A${row}`).border = THIN_BORDER;
    worksheet.getCell(`A${row}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    const valueCell = worksheet.getCell(`B${row}`);
    if (value) valueCell.value = value;
    valueCell.border = THIN_BORDER;
    valueCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    valueCell.numFmt = THAI_TEXT_FORMAT;
    worksheet.mergeCells(`B${row}:D${row}`);
    worksheet.getRow(row).height = row === 20 ? 32 : 24;
  }

  addValidation(worksheet, "B2", wholeAtLeastZero("จำนวนผู้ใช้", "กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป (ไม่รับข้อความหรือค่าลบ)"));
  addValidation(
    worksheet,
    "B3",
    wholeAtLeastZero("จำนวนคำถามต่อวัน", "กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(worksheet, "B4", {
    type: "whole",
    operator: "between",
    formulae: [0, 31],
    allowBlank: false,
    showErrorMessage: true,
    showInputMessage: true,
    errorStyle: "stop",
    errorTitle: "จำนวนวันใช้งาน",
    error: "กรอกจำนวนเต็ม 0-31 วัน (ไม่รับข้อความหรือค่าลบ)",
    promptTitle: "จำนวนวันใช้งาน",
    prompt: "กรอกจำนวนเต็ม 0-31 วัน",
  });
  addValidation(
    worksheet,
    "B5",
    decimalAtLeastZero(
      "จำนวนการเรียกต่อคำถาม",
      "กรอกค่า >= 0 (ทศนิยมได้); 1 = หนึ่งการเรียกต่อหนึ่งคำถาม, 1.1 = มี retry",
    ),
  );
  addValidation(
    worksheet,
    "B6",
    wholeAtLeastZero("จำนวนโทเคนขาเข้า", "กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(
    worksheet,
    "B7",
    wholeAtLeastZero("จำนวนโทเคนขาออก", "กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(
    worksheet,
    "B8",
    decimalAtLeastZero("ราคาโทเคนขาเข้า", "กรอกค่า >= 0 (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(
    worksheet,
    "B9",
    decimalAtLeastZero("ราคาโทเคนขาออก", "กรอกค่า >= 0 (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(worksheet, "B10", {
    type: "decimal",
    operator: "greaterThan",
    formulae: [0],
    allowBlank: false,
    showErrorMessage: true,
    showInputMessage: true,
    errorStyle: "stop",
    errorTitle: "อัตราแลกเปลี่ยน",
    error: "อัตราแลกเปลี่ยนต้องมากกว่า 0 (ไม่รับข้อความหรือค่าลบ)",
    promptTitle: "อัตราแลกเปลี่ยน",
    prompt: "กรอกอัตราแลกเปลี่ยนที่มากกว่า 0",
  });
  addValidation(
    worksheet,
    "B11",
    decimalAtLeastZero("ค่าโฮสติ้ง", "กรอกค่า >= 0 (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(
    worksheet,
    "B12",
    decimalAtLeastZero("ค่าโดเมน", "กรอกค่า >= 0 (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(
    worksheet,
    "B13",
    decimalAtLeastZero("ต้นทุนผันแปรอื่น ๆ", "กรอกค่า >= 0 (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(
    worksheet,
    "B14",
    decimalAtLeastZero("ต้นทุนคงที่อื่น ๆ", "กรอกค่า >= 0 (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(worksheet, "B15", {
    type: "decimal",
    operator: "between",
    formulae: [0, 1],
    allowBlank: false,
    showErrorMessage: true,
    showInputMessage: true,
    errorStyle: "stop",
    errorTitle: "เงินสำรองเผื่อฉุกเฉิน",
    error: "กรอกค่า 0 ถึง 1 (0%-100%); ไม่รับข้อความหรือค่าลบ",
    promptTitle: "เงินสำรองเผื่อฉุกเฉิน",
    prompt: "กรอกค่า 0 ถึง 1 (0% = ไม่กันเงินสำรอง)",
  });

  worksheet.protect("", {});
}

function buildScenariosSheet(workbook: ExcelJS.Workbook): void {
  const worksheet = workbook.addWorksheet("Scenarios", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.getColumn(1).width = 48;
  worksheet.getColumn(2).width = 20;
  worksheet.getColumn(3).width = 20;
  worksheet.getColumn(4).width = 24;
  worksheet.getColumn(5).width = 4;

  worksheet.getCell("A1").value = "รายการ (item)";
  worksheet.getCell("B1").value = "baseline";
  worksheet.getCell("C1").value = "1,000 users";
  worksheet.getCell("D1").value = "100 users with 1.1 calls";
  styleHeaderRow(worksheet, 1, 4);

  const scenarios: Array<{
    column: string;
    users: number;
    questionsPerUserDay: number;
    days: number;
    calls: number;
  }> = [
    { column: "B", users: 100, questionsPerUserDay: shared.questions_per_user_day, days: shared.days_per_month, calls: 1 },
    { column: "C", users: 1000, questionsPerUserDay: shared.questions_per_user_day, days: shared.days_per_month, calls: 1 },
    { column: "D", users: 100, questionsPerUserDay: shared.questions_per_user_day, days: shared.days_per_month, calls: 1.1 },
  ];

  const resultsByColumn: Record<string, ScenarioResult> = {};
  for (const scenario of scenarios) {
    resultsByColumn[scenario.column] = computeScenario(
      scenario.users,
      scenario.questionsPerUserDay,
      scenario.days,
      scenario.calls,
    );
  }

  const scenarioRows: Array<{ row: number; label: string; format: string; value: (scenario: (typeof scenarios)[number]) => number }> = [
    { row: 2, label: "จำนวนผู้ใช้ (users)", format: COUNT_FORMAT, value: (s) => s.users },
    {
      row: 3,
      label: "จำนวนคำถามต่อผู้ใช้ต่อวัน (questions/user/day)",
      format: COUNT_FORMAT,
      value: (s) => s.questionsPerUserDay,
    },
    { row: 4, label: "จำนวนวันใช้งานต่อเดือน (active days)", format: COUNT_FORMAT, value: (s) => s.days },
    {
      row: 5,
      label: "จำนวนการเรียกโมเดลเฉลี่ยต่อคำถาม (average calls/question)",
      format: RATE_FORMAT,
      value: (s) => s.calls,
    },
  ];

  for (const row of scenarioRows) {
    const labelCell = worksheet.getCell(`A${row.row}`);
    labelCell.value = row.label;
    labelCell.font = { bold: true };
    labelCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    labelCell.border = THIN_BORDER;

    for (const scenario of scenarios) {
      const cell = worksheet.getCell(`${scenario.column}${row.row}`);
      cell.value = row.value(scenario);
      cell.numFmt = row.format;
      cell.fill = solid(INPUT_FILL);
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.protection = { locked: false };
    }
    worksheet.getRow(row.row).height = 28;
  }

  const labels: Record<number, string> = {
    7: "จำนวนคำถามต่อเดือน (questions/month)",
    8: "จำนวนการเรียกโมเดลต่อเดือน (model calls/month)",
    9: "ต้นทุนต่อการเรียกหนึ่งครั้ง (THB per model call)",
    10: "ต้นทุนโมเดลต่อคำถาม (THB per question)",
    11: "ต้นทุนโมเดลต่อเดือน (model cost/month)",
    12: "ต้นทุนคงที่ต่อเดือน (fixed cost/month)",
    13: "ต้นทุนรวมก่อนเงินสำรอง (subtotal before contingency)",
    14: "เงินสำรองเผื่อฉุกเฉิน (contingency)",
    15: "ต้นทุนรวมต่อเดือน (total/month)",
    16: "ต้นทุนต่อคำถาม (THB per question)",
  };

  for (let row = 7; row <= 16; row += 1) {
    const labelCell = worksheet.getCell(`A${row}`);
    labelCell.value = labels[row];
    labelCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    labelCell.border = THIN_BORDER;
    if (row === 15) labelCell.font = { bold: true };
    worksheet.getRow(row).height = 24;

    for (const scenario of scenarios) {
      const template = layout.baseline_formulas[`B${row}`];
      const formula = shiftFormulaToColumn(template, scenario.column);
      const result = resultsByColumn[scenario.column][RESULT_FIELD_BY_ROW[row]];
      setFormulaCell(
        worksheet,
        `${scenario.column}${row}`,
        formula,
        result,
        RESULT_FORMAT_BY_ROW[row],
      );
      worksheet.getCell(`${scenario.column}${row}`).alignment = {
        vertical: "middle",
        horizontal: "right",
      };
      if (row === 15) worksheet.getCell(`${scenario.column}${row}`).font = { bold: true };
    }
  }

  worksheet.getCell("A17").value = "ป้ายราคา (pricing label)";
  worksheet.getCell("B17").value = "ราคาสมมติสำหรับการสอน (fictional teaching prices)";
  worksheet.getCell("A18").value = "แหล่งที่มาของราคา (price source)";
  worksheet.getCell("A19").value = "วันที่ตรวจสอบราคา (price checked date)";
  worksheet.getCell("A20").value = "ข้อยกเว้น (exclusions)";
  worksheet.getCell("B20").value = "ไม่รวมบริการที่ยังไม่ระบุ, ภาษี, และค่าบริการเพิ่มเติมของผู้ให้บริการ";

  for (const row of [17, 18, 19, 20]) {
    worksheet.getCell(`A${row}`).font = { bold: true };
    worksheet.getCell(`A${row}`).border = THIN_BORDER;
    worksheet.getCell(`A${row}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    worksheet.mergeCells(`B${row}:D${row}`);
    const cell = worksheet.getCell(`B${row}`);
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    cell.fill = solid(NOTE_FILL);
    worksheet.getRow(row).height = row === 20 ? 30 : 22;
  }

  addValidation(worksheet, "B2:D2", wholeAtLeastZero("จำนวนผู้ใช้", "กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป (ไม่รับข้อความหรือค่าลบ)"));
  addValidation(
    worksheet,
    "B3:D3",
    wholeAtLeastZero("จำนวนคำถามต่อวัน", "กรอกจำนวนเต็มตั้งแต่ 0 ขึ้นไป (ไม่รับข้อความหรือค่าลบ)"),
  );
  addValidation(worksheet, "B4:D4", {
    type: "whole",
    operator: "between",
    formulae: [0, 31],
    allowBlank: false,
    showErrorMessage: true,
    showInputMessage: true,
    errorStyle: "stop",
    errorTitle: "จำนวนวันใช้งาน",
    error: "กรอกจำนวนเต็ม 0-31 วัน (ไม่รับข้อความหรือค่าลบ)",
    promptTitle: "จำนวนวันใช้งาน",
    prompt: "กรอกจำนวนเต็ม 0-31 วัน",
  });
  addValidation(
    worksheet,
    "B5:D5",
    decimalAtLeastZero(
      "จำนวนการเรียกต่อคำถาม",
      "กรอกค่า >= 0 (ทศนิยมได้); 1 = หนึ่งการเรียกต่อหนึ่งคำถาม, 1.1 = มี retry",
    ),
  );

  worksheet.protect("", {});
}

type CheckKind = "count" | "ratio" | "thb" | "guard";

type CheckDefinition = {
  label: string;
  actualFormula: string;
  actualResult: number;
  expected: number;
  kind: CheckKind;
  explanation: string;
  format: string;
};

function checkResultFormula(row: number, kind: CheckKind): string {
  switch (kind) {
    case "count":
      return `IF(ROUND(B${row},0)=C${row},"PASS","FAIL")`;
    case "ratio":
      return `IF(ABS(B${row}-C${row})<0.0000001,"PASS","FAIL")`;
    case "thb":
      return `IF(ABS(B${row}-C${row})<0.005,"PASS","FAIL")`;
    case "guard":
      return `IF(AND(NOT(ISERROR(B${row})),B${row}=C${row}),"PASS","FAIL")`;
  }
}

function buildChecksSheet(workbook: ExcelJS.Workbook, baseline: ScenarioResult): void {
  const worksheet = workbook.addWorksheet("Checks");
  worksheet.getColumn(1).width = 44;
  worksheet.getColumn(2).width = 18;
  worksheet.getColumn(3).width = 18;
  worksheet.getColumn(4).width = 14;
  worksheet.getColumn(5).width = 52;
  worksheet.getColumn(6).width = 3;
  worksheet.getColumn(7).width = 36;
  worksheet.getColumn(8).width = 18;

  worksheet.getCell("A1").value = "การตรวจสอบ (check)";
  worksheet.getCell("B1").value = "ค่าที่คำนวณได้ (actual)";
  worksheet.getCell("C1").value = "ค่าที่คาดไว้ (expected)";
  worksheet.getCell("D1").value = "ผล (PASS/FAIL)";
  worksheet.getCell("E1").value = "หมายเหตุ (note)";
  styleHeaderRow(worksheet, 1, 5);

  const moreUsers = computeScenario(
    1000,
    shared.questions_per_user_day,
    shared.days_per_month,
    1,
  );
  const retry = computeScenario(100, shared.questions_per_user_day, shared.days_per_month, 1.1);
  const zero = computeScenario(0, shared.questions_per_user_day, shared.days_per_month, 1);

  const fx2 = shared.thb_per_usd * 2;
  const fxCostPerCall =
    ((shared.input_tokens * shared.input_usd_per_million +
      shared.output_tokens * shared.output_usd_per_million) /
      1_000_000) *
    fx2;
  const fxModelCost =
    baseline.questions * (1 * fxCostPerCall + shared.other_variable_thb_question);
  const fxFixedCost = FIXED_COST;
  const fxTotal = (fxModelCost + fxFixedCost) * (1 + shared.contingency_fraction);

  const definitions: CheckDefinition[] = [
    {
      label: "baseline: จำนวนคำถาม (questions)",
      actualFormula: "Scenarios!B7",
      actualResult: baseline.questions,
      expected: 11000,
      kind: "count",
      explanation: "ผู้ใช้ 100 × 5 คำถาม × 22 วัน = 11,000 คำถาม",
      format: COUNT_FORMAT,
    },
    {
      label: "baseline: ต้นทุนต่อการเรียก (THB per call)",
      actualFormula: "Scenarios!B9",
      actualResult: baseline.costPerCall,
      expected: 0.14,
      kind: "ratio",
      explanation: "(1,500 × 1 + 500 × 5) / 1,000,000 × 35 = 0.14 บาท",
      format: PER_CALL_FORMAT,
    },
    {
      label: "baseline: ต้นทุนโมเดล (THB)",
      actualFormula: "Scenarios!B11",
      actualResult: baseline.modelCost,
      expected: 1540,
      kind: "thb",
      explanation: "11,000 การเรียก × 0.14 = 1,540 บาท",
      format: THB_FORMAT,
    },
    {
      label: "baseline: ต้นทุนคงที่ (THB)",
      actualFormula: "Scenarios!B12",
      actualResult: baseline.fixedCost,
      expected: 350,
      kind: "thb",
      explanation: "300 ค่าโฮสติ้ง + 600/12 ค่าโดเมน = 350 บาท",
      format: THB_FORMAT,
    },
    {
      label: "baseline: ต้นทุนรวม (THB)",
      actualFormula: "Scenarios!B15",
      actualResult: baseline.total,
      expected: 1890,
      kind: "thb",
      explanation: "1,540 + 350 = 1,890 บาท",
      format: THB_FORMAT,
    },
    {
      label: "1,000 users: จำนวนคำถาม (questions)",
      actualFormula: "Scenarios!C7",
      actualResult: moreUsers.questions,
      expected: 110000,
      kind: "count",
      explanation: "1,000 × 5 × 22 = 110,000 คำถาม",
      format: COUNT_FORMAT,
    },
    {
      label: "1,000 users: ต้นทุนรวม (THB)",
      actualFormula: "Scenarios!C15",
      actualResult: moreUsers.total,
      expected: 15750,
      kind: "thb",
      explanation: "15,400 + 350 = 15,750 บาท",
      format: THB_FORMAT,
    },
    {
      label: "retry: จำนวนการเรียกโมเดล (model calls)",
      actualFormula: "Scenarios!D8",
      actualResult: retry.modelCalls,
      expected: 12100,
      kind: "count",
      explanation: "11,000 คำถาม × 1.1 = 12,100 การเรียก",
      format: COUNT_FORMAT,
    },
    {
      label: "retry: ต้นทุนโมเดล (THB)",
      actualFormula: "Scenarios!D11",
      actualResult: retry.modelCost,
      expected: 1694,
      kind: "thb",
      explanation: "12,100 × 0.14 = 1,694 บาท",
      format: THB_FORMAT,
    },
    {
      label: "retry: ต้นทุนรวม (THB)",
      actualFormula: "Scenarios!D15",
      actualResult: retry.total,
      expected: 2044,
      kind: "thb",
      explanation: "1,694 + 350 = 2,044 บาท",
      format: THB_FORMAT,
    },
    {
      label: "zero users: ต้นทุนรวม (THB)",
      actualFormula: "H10",
      actualResult: zero.total,
      expected: 350,
      kind: "thb",
      explanation: "0 คำถาม ยังมีต้นทุนคงที่ 350 บาท",
      format: THB_FORMAT,
    },
    {
      label: "zero users: ต้นทุนต่อคำถาม (guard)",
      actualFormula: "H11",
      actualResult: zero.perQuestion,
      expected: 0,
      kind: "guard",
      explanation: "IF(questions=0,0,...) ต้องได้ 0 และไม่เกิดข้อผิดพลาดจากการหารด้วยศูนย์",
      format: PER_CALL_FORMAT,
    },
    {
      label: "FX x2: ต้นทุนโมเดล (THB)",
      actualFormula: "H16",
      actualResult: fxModelCost,
      expected: 3080,
      kind: "thb",
      explanation: "อัตราแลกเปลี่ยน ×2 ทำให้ต้นทุนโมเดลเป็น 1,540 × 2 = 3,080 บาท",
      format: THB_FORMAT,
    },
    {
      label: "FX x2: ต้นทุนรวม (THB)",
      actualFormula: "H18",
      actualResult: fxTotal,
      expected: 3430,
      kind: "thb",
      explanation: "3,080 + 350 = 3,430 บาท",
      format: THB_FORMAT,
    },
    {
      label: "FX x2: ต้นทุนคงที่ยังคงเดิม (THB)",
      actualFormula: "H17",
      actualResult: fxFixedCost,
      expected: 350,
      kind: "thb",
      explanation: "อัตราแลกเปลี่ยนไม่กระทบต้นทุนคงที่ 350 บาท",
      format: THB_FORMAT,
    },
  ];

  definitions.forEach((definition, index) => {
    const row = index + 2;
    const labelCell = worksheet.getCell(`A${row}`);
    labelCell.value = definition.label;
    labelCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    labelCell.border = THIN_BORDER;

    const actualCell = worksheet.getCell(`B${row}`);
    actualCell.value = { formula: definition.actualFormula, result: definition.actualResult };
    actualCell.numFmt = definition.format;
    actualCell.border = THIN_BORDER;
    actualCell.alignment = { vertical: "middle", horizontal: "right" };

    const expectedCell = worksheet.getCell(`C${row}`);
    expectedCell.value = definition.expected;
    expectedCell.numFmt = definition.format;
    expectedCell.border = THIN_BORDER;
    expectedCell.alignment = { vertical: "middle", horizontal: "right" };

    const resultCell = worksheet.getCell(`D${row}`);
    resultCell.value = { formula: checkResultFormula(row, definition.kind), result: "PASS" };
    resultCell.border = THIN_BORDER;
    resultCell.alignment = { vertical: "middle", horizontal: "center" };
    resultCell.font = { bold: true };

    const noteCell = worksheet.getCell(`E${row}`);
    noteCell.value = definition.explanation;
    noteCell.border = THIN_BORDER;
    noteCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    noteCell.font = { color: { argb: "FF404040" } };

    worksheet.getRow(row).height = 26;
  });

  // Formula-based zero-user block. Checks!B12 and B13 read H10 and H11.
  worksheet.getCell("G1").value = "สูตรทดสอบ: 0 ผู้ใช้ (zero-user block)";
  worksheet.getCell("G1").font = { bold: true, color: { argb: "FF1F3864" } };
  worksheet.getCell("H1").fill = solid(SECTION_FILL);

  const zeroBlock: Array<[number, string, string | number, string, boolean]> = [
    [2, "users", 0, COUNT_FORMAT, true],
    [3, "questions/user/day", shared.questions_per_user_day, COUNT_FORMAT, true],
    [4, "active days", shared.days_per_month, COUNT_FORMAT, true],
    [5, "calls/question", 1, RATE_FORMAT, true],
    [6, "questions", "H2*H3*H4", COUNT_FORMAT, false],
    [7, "cost per model call", "(Inputs!$B$6*Inputs!$B$8+Inputs!$B$7*Inputs!$B$9)/1000000*Inputs!$B$10", PER_CALL_FORMAT, false],
    [8, "model cost", "H6*H5*H7+H6*Inputs!$B$13", THB_FORMAT, false],
    [9, "fixed cost", "Inputs!$B$11+Inputs!$B$12/12+Inputs!$B$14", THB_FORMAT, false],
    [10, "total", "(H8+H9)*(1+Inputs!$B$15)", THB_FORMAT, false],
    [11, "per question (guard)", "IF(H6=0,0,H10/H6)", PER_CALL_FORMAT, false],
  ];

  for (const [row, label, value, format, isInput] of zeroBlock) {
    worksheet.getCell(`G${row}`).value = label;
    worksheet.getCell(`G${row}`).font = { color: { argb: "FF404040" } };
    const cell = worksheet.getCell(`H${row}`);
    if (typeof value === "string") {
      const cached =
        row === 6 ? zero.questions
        : row === 7 ? zero.costPerCall
        : row === 8 ? zero.modelCost
        : row === 9 ? zero.fixedCost
        : row === 10 ? zero.total
        : zero.perQuestion;
      cell.value = { formula: value, result: cached };
    } else {
      cell.value = value;
      if (isInput) cell.fill = solid(INPUT_FILL);
    }
    cell.numFmt = format;
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", horizontal: "right" };
  }

  // Formula-based doubled-exchange-rate block. Checks!B14..B16 read H16..H18.
  worksheet.getCell("G13").value = "สูตรทดสอบ: อัตราแลกเปลี่ยน ×2 (FX x2 block)";
  worksheet.getCell("G13").font = { bold: true, color: { argb: "FF1F3864" } };
  worksheet.getCell("H13").fill = solid(SECTION_FILL);

  const fxBlock: Array<[number, string, string | number, string, number]> = [
    [14, "THB/USD (x2)", "Inputs!$B$10*2", RATE_FORMAT, fx2],
    [15, "baseline model cost", "Scenarios!B11", THB_FORMAT, baseline.modelCost],
    [
      16,
      "model cost at FX x2",
      "Scenarios!B7*(Scenarios!B5*((Inputs!$B$6*Inputs!$B$8+Inputs!$B$7*Inputs!$B$9)/1000000*H14)+Inputs!$B$13)",
      THB_FORMAT,
      fxModelCost,
    ],
    [17, "fixed cost (unchanged)", "Inputs!$B$11+Inputs!$B$12/12+Inputs!$B$14", THB_FORMAT, fxFixedCost],
    [18, "total at FX x2", "(H16+H17)*(1+Inputs!$B$15)", THB_FORMAT, fxTotal],
  ];

  for (const [row, label, formula, format, cached] of fxBlock) {
    worksheet.getCell(`G${row}`).value = label;
    worksheet.getCell(`G${row}`).font = { color: { argb: "FF404040" } };
    const cell = worksheet.getCell(`H${row}`);
    cell.value = typeof formula === "string" ? { formula, result: cached } : formula;
    cell.numFmt = format;
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", horizontal: "right" };
  }

  worksheet.getCell("A19").value = "หมายเหตุสำคัญ (important note)";
  worksheet.getCell("A19").font = { bold: true, color: { argb: "FF833C0B" } };
  worksheet.getCell("A19").fill = solid(WARNING_FILL);
  worksheet.mergeCells("A19:E19");
  worksheet.getCell("A19").alignment = { vertical: "middle", horizontal: "left" };

  worksheet.mergeCells("A20:E20");
  const note = worksheet.getCell("A20");
  note.value =
    "สเปรดชีตไม่ได้บังคับงบประมาณ API (a spreadsheet does not enforce an API budget) ใบเรียกเก็บจริงอาจมีค่าแคช (cache pricing), reasoning tokens, tools, embeddings, storage, network, context tiers, taxes และราคาที่ต่างจากนี้ ตัวเลขในไฟล์นี้เป็นแบบจำลองเพื่อการสอนเท่านั้น";
  note.font = { color: { argb: "FF833C0B" } };
  note.fill = solid(WARNING_FILL);
  note.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  note.border = THIN_BORDER;
  worksheet.getRow(20).height = 64;

  worksheet.mergeCells("A21:E21");
  const checksScope = worksheet.getCell("A21");
  checksScope.value =
    "Checks ตรวจค่าอ้างอิงจากค่าเริ่มต้นของไฟล์; ถ้าแก้ Inputs หรือ Scenarios ผลบางแถวอาจเปลี่ยนเป็น FAIL ตามค่าที่แก้ ซึ่งเป็นพฤติกรรมที่ถูกต้อง";
  checksScope.font = { italic: true, color: { argb: "FF595959" } };
  checksScope.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  worksheet.getRow(21).height = 30;
}

/**
 * Rewrite the ZIP container with fixed entry timestamps.
 *
 * ExcelJS asks JSZip for entries without a date, so every build would otherwise
 * embed the current time and produce a different SHA-256. Local noon keeps the
 * DOS timestamp identical in every timezone, which makes the committed
 * artifact reproducible from the same source.
 */
async function normalizeZip(buffer: Buffer): Promise<Buffer> {
  const source = await JSZip.loadAsync(buffer);
  const normalized = new JSZip();
  const fixedDate = new Date(2026, 9, 24, 12, 0, 0);

  for (const name of Object.keys(source.files).sort()) {
    const entry = source.files[name];
    if (!entry || entry.dir) continue;
    const data = await entry.async("nodebuffer");
    normalized.file(name, data, {
      date: fixedDate,
      compression: "DEFLATE",
      createFolders: false,
    });
  }

  return normalized.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    platform: "DOS",
  });
}

/**
 * Build the release workbook in memory. Callers write the returned bytes to
 * public/downloads/AIPASS_AI_App_Cost_Calculator_v1.xlsx.
 */
export async function buildCalculatorWorkbookBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AIPASS Launch & Operate demo";
  workbook.lastModifiedBy = "AIPASS Launch & Operate demo";
  workbook.created = new Date("2026-10-24T00:00:00Z");
  workbook.modified = new Date("2026-10-24T00:00:00Z");
  workbook.company = "AIPASS fictional teaching data";
  workbook.subject = "Offline AI app cost calculator (fictional teaching prices)";
  workbook.title = "AIPASS AI App Cost Calculator v1";
  workbook.description =
    "Macro-free offline calculator. All prices are fictional teaching prices and never describe a real provider.";
  workbook.calcProperties.fullCalcOnLoad = true;

  buildStartSheet(workbook);
  buildInputsSheet(workbook);
  buildScenariosSheet(workbook);
  buildChecksSheet(
    workbook,
    computeScenario(100, shared.questions_per_user_day, shared.days_per_month, 1),
  );

  const buffer = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
  return normalizeZip(buffer);
}
