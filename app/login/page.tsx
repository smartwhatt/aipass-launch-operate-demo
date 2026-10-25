import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getShell } from "@/lib/shell";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const { viewer, config } = await getShell();
  if (viewer) redirect("/");

  return (
    <div className="page">
      <div className="login-shell">
        <div className="login-card stack">
          <div>
            <p className="hero__eyebrow" style={{ marginBottom: "0.6rem" }}>
              ถามคู่มือ · ศูนย์บริการตัวอย่าง
            </p>
            <h1 style={{ fontSize: "1.6rem" }}>เข้าสู่ระบบ</h1>
            <p className="small muted" style={{ marginTop: "0.5rem" }}>
              ใช้บัญชีที่ได้รับสำหรับหลักสูตรนี้ บัญชีแต่ละแบบมีสิทธิ์ต่างกันตามตารางด้านล่าง
            </p>
          </div>

          <Suspense fallback={<p className="small muted">กำลังเตรียมแบบฟอร์ม…</p>}>
            <LoginForm />
          </Suspense>

          <div>
            <p className="tiny faint" style={{ marginBottom: "0.4rem" }}>
              สิทธิ์การใช้งาน
            </p>
            <dl className="roles">
              <div className="roles__row">
                <dt>ผู้ดูแลระบบ</dt>
                <dd>ดูร่องรอยคำขอ เปลี่ยนสถานการณ์ และกำหนดค่าคู่มือ</dd>
              </div>
              <div className="roles__row">
                <dt>ผู้ใช้ทั่วไป</dt>
                <dd>ถามคำถามและอ่านคู่มือบริการ</dd>
              </div>
              <div className="roles__row">
                <dt>ผู้ใช้ภายนอก</dt>
                <dd>ยังไม่ได้รับสิทธิ์ใช้งาน</dd>
              </div>
            </dl>
          </div>

          <details className="tiny">
            <summary className="muted" style={{ cursor: "pointer" }}>
              สำหรับผู้ดูแลการอบรม
            </summary>
            <p className="faint" style={{ marginTop: "0.5rem" }}>
              บัญชีถูกสร้างด้วย <span className="mono">npm run setup</span> และรหัสผ่านอยู่ในไฟล์{" "}
              <span className="mono">local-accounts.{config.DATA_NAMESPACE}.txt</span> บนเครื่องที่ติดตั้ง
              ไม่มีรหัสผ่านเริ่มต้นในโค้ดหรือในหน้านี้ ·{" "}
              <Link href="/api/health">สถานะระบบ (JSON)</Link>
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
