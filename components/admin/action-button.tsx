"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Small POST action with an optional two-step confirmation.
 *
 * Demo resets are destructive to rehearsal data, so the first click arms the
 * action and the second click runs it. Nothing depends on a browser dialog.
 */
export function ActionButton({
  label,
  endpoint,
  body,
  confirmLabel,
  variant = "ghost",
  size,
  disabled = false,
  disabledReason,
}: {
  label: string;
  endpoint: string;
  body: Record<string, unknown>;
  confirmLabel?: string;
  variant?: "primary" | "ghost" | "quiet";
  size?: "sm";
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const className =
    variant === "primary"
      ? "button"
      : variant === "quiet"
        ? "button button--quiet"
        : "button button--ghost";

  async function run() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
        warnings?: string[];
        note?: string;
        ok?: boolean;
        active_index?: string;
        created?: boolean;
      };
      if (!response.ok) throw new Error(payload.error?.message ?? "ดำเนินการไม่สำเร็จ");
      const notes = [payload.note, ...(payload.warnings ?? [])].filter(Boolean).join(" · ");
      setMessage(notes || "ดำเนินการแล้ว");
      setArmed(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack stack-sm" style={{ gap: "0.3rem" }}>
      <button
        type="button"
        className={`${className}${size === "sm" ? " button--sm" : ""}`}
        disabled={pending || disabled}
        onClick={() => {
          if (confirmLabel && !armed) {
            setArmed(true);
            setMessage(null);
            return;
          }
          void run();
        }}
      >
        {pending ? "กำลังดำเนินการ…" : armed ? (confirmLabel ?? label) : label}
      </button>
      {disabled && disabledReason ? <span className="tiny faint">{disabledReason}</span> : null}
      {armed ? (
        <button
          type="button"
          className="button button--quiet button--sm"
          onClick={() => setArmed(false)}
        >
          ยกเลิก
        </button>
      ) : null}
      {message ? <span className="tiny faint">{message}</span> : null}
      {error ? <span className="tiny form-error">{error}</span> : null}
    </div>
  );
}
