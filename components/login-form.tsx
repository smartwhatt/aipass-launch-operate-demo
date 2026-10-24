"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const form = new FormData(event.currentTarget);
        try {
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: String(form.get("username") ?? "").trim(),
              password: String(form.get("password") ?? ""),
            }),
          });
          const payload = (await response.json()) as {
            error?: { message?: string };
          };
          if (!response.ok) {
            throw new Error(payload.error?.message ?? "เข้าสู่ระบบไม่สำเร็จ");
          }
          router.push(next.startsWith("/") ? next : "/");
          router.refresh();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "เข้าสู่ระบบไม่สำเร็จ");
          setPending(false);
        }
      }}
    >
      <label className="field">
        <span className="field__label">ชื่อผู้ใช้</span>
        <input
          className="input"
          name="username"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="admin, pilot, หรือ outsider"
        />
      </label>
      <label className="field">
        <span className="field__label">รหัสผ่าน</span>
        <input
          className="input"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button button--block" type="submit" disabled={pending}>
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
