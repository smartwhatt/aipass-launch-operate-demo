/**
 * Question validation, shared by the route handler and tests.
 *
 * A trimmed length of 1–2,000 Unicode characters. Blank and oversized inputs
 * are rejected before any admission or model call.
 */

export const MIN_QUESTION_LENGTH = 1;
export const MAX_QUESTION_LENGTH = 2000;

export type QuestionValidation =
  | { ok: true; question: string }
  | { ok: false; code: "empty_question" | "question_too_long"; message: string; length: number };

export function validateQuestion(raw: unknown): QuestionValidation {
  const text = typeof raw === "string" ? raw.trim() : "";
  const length = Array.from(text).length;

  if (length < MIN_QUESTION_LENGTH) {
    return {
      ok: false,
      code: "empty_question",
      message: "ยังไม่ได้พิมพ์คำถาม",
      length,
    };
  }
  if (length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      code: "question_too_long",
      message: `คำถามยาว ${length} ตัวอักษร เกิน ${MAX_QUESTION_LENGTH} ตัวอักษร`,
      length,
    };
  }
  return { ok: true, question: text };
}
