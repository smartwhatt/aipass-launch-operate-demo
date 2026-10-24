/**
 * Purpose: build the committed offline Excel cost calculator.
 *
 * Usage:
 *   npm run calculator:build
 *
 * Writes public/downloads/AIPASS_AI_App_Cost_Calculator_v1.xlsx, then reads the
 * bytes back to print the sheet order, SHA-256, and byte size. The workbook is
 * macro-free and every formula carries a cached result.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  CALCULATOR_FILENAME,
  buildCalculatorWorkbookBuffer,
} from "@/lib/calculator/workbook";

async function main(): Promise<void> {
  const downloadsDir = path.resolve(process.cwd(), "public", "downloads");
  const outputPath = path.join(downloadsDir, CALCULATOR_FILENAME);

  mkdirSync(downloadsDir, { recursive: true });

  const built = await buildCalculatorWorkbookBuffer();
  writeFileSync(outputPath, built);

  const bytes = readFileSync(outputPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(outputPath);
  const sheets = workbook.worksheets.map((worksheet) => worksheet.name);

  console.log("calculator:build");
  console.log(`file:   ${path.relative(process.cwd(), outputPath)}`);
  console.log(`sheets: ${sheets.join(", ")}`);
  console.log(`sha256: ${sha256}`);
  console.log(`bytes:  ${bytes.byteLength}`);
  console.log("status: OK");
}

main().catch((error: unknown) => {
  console.error("calculator:build FAILED");
  console.error(error);
  process.exit(1);
});
