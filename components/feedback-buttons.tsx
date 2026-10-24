"use client";

import { useState } from "react";

/**
 * Answer-quality feedback. 24 feedback rows in the historical dataset are the
 * teaching example of "8 of 24 marked needs correction".
 */
export function FeedbackButtons({ requestId }: { requestId: string }) {
  const [sent, setSent] = useState<"helpful" | "needs_correction" | null>(null);
  const [pending, setPending] = useState<"helpful" | "needs_correction" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(label: "helpful" | "needs_correction") {
    setPending(label);
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, label }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "ส่งความคิดเห็นไม่สำเร็จ");
      }
      setSent(label);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ส่งความคิดเห็นไม่สำเร็จ");
    } finally {
      setPending(null);
    }
  }

  if (!requestId) return null;

  return (
    <div className="stack stack-sm" style={{ gap: "0.4rem" }}>
      <div className="row" style={{ gap: "0.5rem" }}>
        <span className="small faint">คำตอบนี้ใช้ได้ไหม</span>
        {sent ? (
          <span className="badge badge--ok">
            {sent === "helpful" ? "บันทึกว่าใช้ได้" : "บันทึกว่าต้องแก้ไข"}
          </span>
        ) : (
          <>
            <button
              type="button"
              className="button button--ghost button--sm"
              disabled={pending !== null}
              onClick={() => send("helpful")}
            >
              {pending === "helpful" ? "กำลังส่ง…" : "ใช้ได้"}
            </button>
            <button
              type="button"
              className="button button--ghost button--sm"
              disabled={pending !== null}
              onClick={() => send("needs_correction")}
            >
              {pending === "needs_correction" ? "กำลังส่ง…" : "ต้องแก้ไข"}
            </button>
          </>
        )}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
