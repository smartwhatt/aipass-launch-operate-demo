import Link from "next/link";
import type { IncidentInfo } from "@/lib/state/active";
import { formatThaiDateTime } from "@/lib/format";

/**
 * Incident banner: a human decision stops automatic answers for one topic and
 * points readers at the handbook version that was actually checked.
 */
export function IncidentBanner({
  incident,
  checkedHandbookHref,
}: {
  incident: IncidentInfo;
  checkedHandbookHref: string;
}) {
  if (!incident.enabled) return null;

  return (
    <div className="notice notice--warn" role="status">
      <div className="row-between" style={{ alignItems: "baseline" }}>
        <div className="notice__title">หยุดตอบอัตโนมัติบางหัวข้อชั่วคราว</div>
        <span className="badge badge--warn">เหตุขัดข้องที่เปิดอยู่</span>
      </div>
      <p className="small" style={{ marginTop: "0.35rem" }}>
        {incident.message ??
          "พบว่าคู่มือที่ใช้ตอบเป็นฉบับเก่า ระบบจึงหยุดตอบคำถามเรื่องวันและเวลาเปิดบริการชั่วคราว"}
      </p>
      <p className="small muted" style={{ marginTop: "0.4rem" }}>
        ใช้คู่มือฉบับที่ตรวจสอบแล้วแทน:{" "}
        <Link href={checkedHandbookHref} prefetch={false}>
          อ่านข้อ 2.1 ในคู่มือฉบับล่าสุด
        </Link>
      </p>
      <p className="tiny faint" style={{ marginTop: "0.5rem" }}>
        ผู้รับผิดชอบ: {incident.owner ?? "ทีมบริการศูนย์ (สมมติ)"}
        {incident.nextUpdateAt
          ? ` · อัปเดตครั้งถัดไป: ${formatThaiDateTime(incident.nextUpdateAt)}`
          : ""}
      </p>
    </div>
  );
}
