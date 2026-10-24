"use client";

import { useId, useState } from "react";

/**
 * Contact panel.
 *
 * A local, fictional panel — no real email address or phone number. It hosts
 * the internal meeting-room request form from handbook section 3.2 and labels
 * every submission as fictional teaching data.
 */
export function ContactPanel({ triggerLabel = "ติดต่อศูนย์" }: { triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        className="button button--ghost"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {triggerLabel}
      </button>

      <div id={panelId} hidden={!open} style={{ marginTop: "1rem" }}>
        <div className="card card--panel stack stack-sm">
          <div className="row-between">
            <h3>ติดต่อศูนย์ (ช่องทางสมมติ)</h3>
            <span className="badge">ข้อมูลสมมติ</span>
          </div>
          <p className="small muted">
            ช่องทางนี้ใช้ในบทเรียนเท่านั้น ไม่มีอีเมลหรือเบอร์โทรจริง และไม่มีการส่งข้อความออกนอกระบบ
            คำขอใช้ห้องประชุมจะถูกบันทึกไว้ในฐานข้อมูลของเดโมพร้อมเลขที่อ้างอิง
          </p>

          {reference ? (
            <div className="notice notice--ok">
              <div className="notice__title">บันทึกคำขอสมมติแล้ว</div>
              <p className="small">
                เลขที่อ้างอิง <span className="mono">{reference}</span> — เจ้าหน้าที่ศูนย์ (สมมติ)
                จะตอบกลับผ่านช่องทางในแอป
              </p>
            </div>
          ) : (
            <form
              className="stack stack-sm"
              onSubmit={async (event) => {
                event.preventDefault();
                setPending(true);
                setError(null);
                const form = new FormData(event.currentTarget);
                try {
                  const response = await fetch("/api/contact", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      display_name: String(form.get("display_name") ?? "").trim(),
                      access_date: String(form.get("access_date") ?? "") || undefined,
                      attendees: form.get("attendees")
                        ? Number(form.get("attendees"))
                        : undefined,
                      note: String(form.get("note") ?? "").trim() || undefined,
                    }),
                  });
                  const payload = (await response.json()) as {
                    reference?: string;
                    error?: { message?: string };
                  };
                  if (!response.ok) throw new Error(payload.error?.message ?? "ส่งคำขอไม่สำเร็จ");
                  setReference(payload.reference ?? "RM-DEMO");
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "ส่งคำขอไม่สำเร็จ");
                } finally {
                  setPending(false);
                }
              }}
            >
              <label className="field">
                <span className="field__label">ชื่อที่ใช้แสดง (ไม่ต้องใช้ชื่อจริง)</span>
                <input
                  className="input"
                  name="display_name"
                  required
                  maxLength={80}
                  defaultValue=""
                  placeholder="เช่น ผู้ใช้ทดลอง A"
                  autoComplete="off"
                />
              </label>
              <div className="row" style={{ alignItems: "flex-start", gap: "0.75rem" }}>
                <label className="field" style={{ flex: "1 1 10rem" }}>
                  <span className="field__label">วันที่ต้องการใช้ห้อง</span>
                  <input className="input" type="date" name="access_date" />
                </label>
                <label className="field" style={{ flex: "0 0 8rem" }}>
                  <span className="field__label">จำนวนผู้เข้าร่วม</span>
                  <input
                    className="input"
                    type="number"
                    name="attendees"
                    min={1}
                    max={50}
                    defaultValue={5}
                  />
                </label>
              </div>
              <label className="field">
                <span className="field__label">รายละเอียด (ไม่ใส่ข้อมูลส่วนตัว)</span>
                <textarea
                  className="textarea"
                  name="note"
                  maxLength={500}
                  style={{ minHeight: "4.5rem" }}
                  placeholder="เช่น ขอใช้ห้องประชุมเพื่อซ้อมตอบคำถามคู่มือ"
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <div className="row">
                <button className="button" type="submit" disabled={pending}>
                  {pending ? "กำลังส่ง…" : "ส่งคำขอสมมติ"}
                </button>
                <span className="small faint">ไม่ต้องกรอกเลขบัตรประชาชนหรือข้อมูลส่วนตัว</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
