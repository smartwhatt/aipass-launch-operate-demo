"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IncidentEditor({
  enabled,
  topic,
  message,
  owner,
  nextUpdate,
}: {
  enabled: boolean;
  topic: string | null;
  message: string | null;
  owner: string | null;
  nextUpdate: string | null;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function save(nextEnabled: boolean) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: nextEnabled,
          topic,
          message,
          owner,
          next_update: nextUpdate,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "บันทึกไม่สำเร็จ");
      }
      setOn(nextEnabled);
      setFeedback(nextEnabled ? "เปิดแบนเนอร์เหตุขัดข้องแล้ว" : "ปิดแบนเนอร์เหตุขัดข้องแล้ว");
      router.refresh();
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack stack-sm">
      <div className="row-between">
        <div>
          <div className="small">
            สถานะแบนเนอร์: <strong>{on ? "เปิดอยู่" : "ปิดอยู่"}</strong>
          </div>
          <p className="tiny faint">
            เมื่อเปิด ระบบจะหยุดตอบอัตโนมัติเฉพาะเรื่องเวลาเปิด–ปิด และชี้ไปที่คู่มือฉบับที่ตรวจสอบแล้ว
          </p>
        </div>
        <button
          type="button"
          className={on ? "button button--ghost button--sm" : "button button--sm"}
          disabled={pending}
          onClick={() => void save(!on)}
        >
          {pending ? "กำลังบันทึก…" : on ? "ปิดแบนเนอร์" : "เปิดแบนเนอร์"}
        </button>
      </div>
      {feedback ? <p className="tiny faint">{feedback}</p> : null}
    </div>
  );
}
