/** Shared display formatting. Safe on the server and in client components. */

const THAI_TZ = "Asia/Bangkok";

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatThaiDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: THAI_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(toDate(value));
}

export function formatThaiDate(value: string | Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: THAI_TZ,
    dateStyle: "long",
  }).format(toDate(value));
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatThb(value: number, digits = 2): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("th-TH").format(value);
}

export function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "พร้อมใช้งานแล้ว";
  if (seconds < 60) return `${Math.ceil(seconds)} วินาที`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ชั่วโมง` : `${hours} ชั่วโมง ${rest} นาที`;
}

export const STATUS_LABELS: Record<string, string> = {
  ok: "ตอบได้",
  insufficient_info: "ข้อมูลไม่พอ",
  unauthorized: "ไม่มีสิทธิ์",
  rate_limited: "ถามเร็วเกินไป",
  quota_exceeded: "โควตาวันนี้ครบ",
  budget_exceeded: "งบประมาณไม่พอ",
  provider_unavailable: "AI ไม่พร้อมใช้งาน",
  invalid_input: "ข้อมูลไม่ถูกต้อง",
  in_progress: "กำลังประมวลผล",
};

export function statusTone(status: string): "ok" | "warn" | "danger" | "neutral" {
  switch (status) {
    case "ok":
      return "ok";
    case "insufficient_info":
      return "warn";
    case "provider_unavailable":
    case "budget_exceeded":
    case "unauthorized":
    case "invalid_input":
      return "danger";
    case "rate_limited":
    case "quota_exceeded":
      return "warn";
    default:
      return "neutral";
  }
}

export const MODE_LABELS: Record<string, string> = {
  fixture: "ข้อมูลจำลอง / Fixture mode",
  live: "Live mode",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "ผู้ดูแลระบบ",
  pilot: "ผู้ใช้ทดลองนำร่อง",
  outsider: "ผู้ใช้ภายนอก",
};
