import type { AnswerStatus, Citation, IndexSection } from "@/lib/domain/types";
import { citationUrl } from "@/lib/retrieval/canonical";
import { normalizeText } from "@/lib/retrieval/normalize";

/**
 * Evidence guards applied to every provider result, live or fixture.
 *
 * 1. Only retrieved sections may be cited.
 * 2. A model answer with no valid citation is not presented as an answer.
 * 3. A fee question answered by text that says "not stated" returns
 *    insufficient_info and says the handbook does not state the amount.
 * 4. URLs and phone numbers the evidence does not contain are removed.
 */

const NOT_STATED = [/ไม่ระบุ/, /ไม่มีข้อมูล/, /ไม่กำหนด/, /not state/i];
const FEE_QUESTION = /ค่าธรรมเนียม|ค่าใช้จ่าย|ราคา|กี่บาท|ต้องจ่าย|ฟรี|ค่า บริการ/;
const URL_PATTERN = /(https?:\/\/[^\s)»,]+|www\.[^\s)»,]+)/gi;
const PHONE_PATTERN = /(?:\+?66|0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}/g;

export type GuardInput = {
  question: string;
  sections: IndexSection[];
  status: "ok" | "insufficient_info";
  answer: string;
  citedSections: string[];
  docKey: string;
};

export type GuardOutput = {
  status: "ok" | "insufficient_info";
  answer: string;
  citations: Citation[];
  notes: string[];
};

export function isFeeQuestion(question: string): boolean {
  return FEE_QUESTION.test(normalizeText(question));
}

export function statesNotStated(text: string): boolean {
  return NOT_STATED.some((pattern) => pattern.test(text));
}

function excerpt(text: string, limit = 240): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function buildCitation(docKey: string, section: IndexSection): Citation {
  return {
    documentId: docKey,
    version: docKey,
    sectionId: section.sectionId,
    sectionTitle: section.title,
    excerpt: excerpt(section.text),
    url: citationUrl(docKey, section.sectionId),
  };
}

function scrubUnsupported(answer: string, evidence: string, notes: string[]): string {
  let cleaned = answer;
  const evidenceNormalized = normalizeText(evidence);

  cleaned = cleaned.replace(URL_PATTERN, (match) => {
    if (evidenceNormalized.includes(normalizeText(match))) return match;
    notes.push(`removed_unverified_url:${match}`);
    return "(ตัดลิงก์ที่ยืนยันไม่ได้ออก)";
  });

  cleaned = cleaned.replace(PHONE_PATTERN, (match) => {
    if (evidenceNormalized.includes(normalizeText(match))) return match;
    notes.push(`removed_unverified_phone:${match}`);
    return "(ตัดเบอร์ที่ยืนยันไม่ได้ออก)";
  });

  return cleaned;
}

export function applyEvidenceGuards(input: GuardInput): GuardOutput {
  const notes: string[] = [];
  const byId = new Map(input.sections.map((section) => [section.sectionId, section]));
  const cited = input.citedSections.filter((sectionId) => byId.has(sectionId));

  let status: GuardOutput["status"] = input.status;
  let answer = input.answer;

  if (status === "ok" && cited.length === 0) {
    notes.push("answer_without_citation");
    status = "insufficient_info";
    answer =
      "คำตอบที่ได้ไม่มีการอ้างอิงข้อในคู่มือที่ตรวจสอบได้ จึงยังไม่ถือว่าตอบได้ ควรเปิดคู่มือหรือติดต่อศูนย์";
  }

  const topSection = cited.length > 0 ? byId.get(cited[0]) : undefined;
  if (topSection && isFeeQuestion(input.question) && statesNotStated(topSection.text)) {
    notes.push("fee_not_stated");
    status = "insufficient_info";
    answer = `${topSection.text} คู่มือจึงไม่ระบุจำนวนค่าธรรมเนียม ควรสอบถามผ่านปุ่ม “ติดต่อศูนย์”`;
  }

  const evidence = input.sections.map((section) => `${section.title} ${section.text}`).join("\n");
  answer = scrubUnsupported(answer, evidence, notes);

  const citations = cited
    .map((sectionId) => byId.get(sectionId))
    .filter((section): section is IndexSection => Boolean(section))
    .map((section) => buildCitation(input.docKey, section));

  return { status, answer, citations, notes };
}

/** Statuses that must show a Thai explanation and a next action. */
export const STATUS_ACTIONS: Record<
  AnswerStatus,
  { label: string; explanation: string; nextAction: string }
> = {
  ok: {
    label: "ตอบได้",
    explanation: "",
    nextAction: "",
  },
  insufficient_info: {
    label: "ข้อมูลไม่พอ",
    explanation: "คู่มือฉบับที่ใช้งานอยู่ไม่มีข้อความที่ตอบคำถามนี้ได้",
    nextAction: "ลองถามใหม่ให้แคบลง เปิดคู่มือดูข้อที่เกี่ยวข้อง หรือติดต่อศูนย์",
  },
  unauthorized: {
    label: "ไม่มีสิทธิ์",
    explanation: "บัญชีนี้ไม่ได้รับสิทธิ์ถามคำถามจากคู่มือนี้",
    nextAction: "เข้าสู่ระบบด้วยบัญชีผู้ใช้ทดลองนำร่อง หรือติดต่อผู้ดูแลระบบ",
  },
  rate_limited: {
    label: "ถามเร็วเกินไป",
    explanation: "ระบบรับคำถามได้ 5 ครั้งใน 60 วินาทีต่อบัญชี",
    nextAction: "รอตามเวลาที่แสดงแล้วส่งคำถามอีกครั้ง",
  },
  quota_exceeded: {
    label: "ใช้โควตาวันนี้ครบ",
    explanation: "บัญชีนี้ใช้คำถามครบ 20 ครั้งสำหรับวันนี้แล้ว",
    nextAction: "รอถึงเวลาเริ่มใหม่ตามเวลาที่แสดง หรือติดต่อศูนย์",
  },
  budget_exceeded: {
    label: "งบประมาณไม่พอ",
    explanation: "งบประมาณสำหรับการสอนเดือนนี้ไม่พอสำหรับการเรียก AI ครั้งใหม่",
    nextAction: "เปิดคู่มือที่ตรวจสอบแล้วหรือติดต่อศูนย์ ระหว่างนี้ผู้ดูแลระบบต้องตรวจงบประมาณ",
  },
  provider_unavailable: {
    label: "AI ไม่พร้อมใช้งาน",
    explanation: "ระบบยังติดต่อผู้ให้บริการ AI ไม่ได้ในขณะนี้",
    nextAction: "เปิดคู่มือที่ตรวจสอบแล้วหรือติดต่อศูนย์ ระบบจะกลับมาให้บริการเมื่อผู้ให้บริการพร้อม",
  },
};
