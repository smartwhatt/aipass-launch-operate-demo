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
              ถามคู่มือ · ข้อมูลสมมติสำหรับการเรียน
            </p>
            <h1 style={{ fontSize: "1.6rem" }}>เข้าสู่ระบบ</h1>
            <p className="small muted" style={{ marginTop: "0.5rem" }}>
              ใช้บัญชีสำหรับการสอนของเดโมนี้ บัญชีถูกสร้างด้วย{" "}
              <span className="mono">npm run setup</span> และรหัสผ่านอยู่ในไฟล์{" "}
              <span className="mono">local-accounts.{config.DATA_NAMESPACE}.txt</span>
            </p>
          </div>

          <Suspense fallback={<p className="small muted">กำลังเตรียมแบบฟอร์ม…</p>}>
            <LoginForm />
          </Suspense>

          <dl className="defs small">
            <div className="defs__row">
              <dt className="defs__key">admin</dt>
              <dd className="defs__value">ดูร่องรอย เปลี่ยนสถานการณ์ และรีเซ็ตข้อมูล</dd>
            </div>
            <div className="defs__row">
              <dt className="defs__key">pilot</dt>
              <dd className="defs__value">ถามคำถามและอ่านคู่มือที่ได้รับสิทธิ์</dd>
            </div>
            <div className="defs__row">
              <dt className="defs__key">outsider</dt>
              <dd className="defs__value">ถูกปฏิเสธจากทั้งการถามและการอ่านคู่มือ</dd>
            </div>
          </dl>

          <p className="tiny faint">
            ไม่มีรหัสผ่านเริ่มต้นในโค้ดหรือในหน้านี้ ·{" "}
            <Link href="/api/health">สถานะระบบ</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
