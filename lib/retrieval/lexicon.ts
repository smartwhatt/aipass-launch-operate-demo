/**
 * Query aliases for Thai handbook questions.
 *
 * These are general question-to-topic rewrites ("กี่โมง" means opening time),
 * not links to specific evaluation cases. Each index stores the alias map it
 * was built with, so a change here is visible as a new index build.
 *
 * `expands` lists Thai terms that occur in handbook text. Retrieval gives
 * sections credit for containing them; nothing here names a section.
 */

export type AliasRule = {
  id: string;
  triggers: string[];
  expands: string[];
};

export const ALIAS_RULES: AliasRule[] = [
  {
    id: "opening_hours",
    triggers: [
      "กี่โมง",
      "กี่นาฬิกา",
      "เวลาเปิด",
      "เวลาเปิดทำการ",
      "เปิดกี่",
      "ปิดกี่",
      "เปิดไหม",
      "ปิดไหม",
      "วันธรรมดา",
      "วันทำการ",
      "ชั่วโมง",
      "เปิดบริการ",
      "ปิดบริการ",
    ],
    expands: ["เปิด", "ปิด", "เวลา", "วันจันทร์", "วันเสาร์", "วันอาทิตย์", "วันหยุด"],
  },
  {
    id: "documents_needed",
    triggers: ["ต้องเตรียม", "เตรียมอะไร", "เอกสาร", "ต้องใช้", "ใช้อะไร", "เตรียม"],
    expands: ["แบบคำขอ", "หนังสือรับรอง", "หน่วยงาน", "เอกสาร"],
  },
  {
    id: "request_channel",
    triggers: ["ทางไหน", "ช่องทาง", "ยื่นที่ไหน", "ส่งที่ไหน", "ยื่นคำขอ", "แบบฟอร์ม"],
    expands: ["ยื่นคำขอ", "แบบฟอร์ม", "ภายในศูนย์", "ช่องทาง"],
  },
  {
    id: "fee",
    triggers: ["ค่าธรรมเนียม", "ค่าใช้จ่าย", "ราคา", "จ่าย", "เท่าไร", "กี่บาท", "ฟรี"],
    expands: ["ค่าธรรมเนียม", "ไม่ระบุ", "จ่าย"],
  },
  {
    id: "contact",
    triggers: ["ติดต่อ", "เจ้าหน้าที่", "เบอร์", "โทร", "สอบถาม", "ติดต่อศูนย์"],
    expands: ["ติดต่อ", "เจ้าหน้าที่", "ปุ่ม", "แอป"],
  },
  {
    id: "personal_data",
    triggers: ["เลขบัตร", "บัตรประชาชน", "ข้อมูลส่วนตัว", "ข้อมูลส่วนบุคคล", "แชท"],
    expands: ["ห้าม", "เลขบัตรประชาชน", "ข้อมูลส่วนตัว", "แชท"],
  },
  {
    id: "meeting_room",
    triggers: ["ห้องประชุม", "จองห้อง", "ขอใช้ห้อง", "ใช้ห้อง"],
    expands: ["ห้องประชุม"],
  },
];

export type AliasMap = Record<string, string[]>;

/** alias phrase -> expansion terms, frozen into the index. */
export function buildAliasMap(): AliasMap {
  const map: AliasMap = {};
  for (const rule of ALIAS_RULES) {
    for (const trigger of rule.triggers) {
      const existing = map[trigger] ?? [];
      map[trigger] = Array.from(new Set([...existing, ...rule.expands]));
    }
  }
  return map;
}

/** Every expansion term, used to mark which sections carry a topic. */
export function allExpansionTerms(): string[] {
  return Array.from(new Set(ALIAS_RULES.flatMap((rule) => rule.expands)));
}

export type MatchedRule = { id: string; expands: string[] };

/** Rules whose trigger text appears in the question. */
export function matchRules(normalizedQuestion: string): MatchedRule[] {
  const matched: MatchedRule[] = [];
  for (const rule of ALIAS_RULES) {
    const hit = rule.triggers.some((trigger) =>
      normalizedQuestion.includes(trigger.toLowerCase()),
    );
    if (hit) matched.push({ id: rule.id, expands: rule.expands });
  }
  return matched;
}
