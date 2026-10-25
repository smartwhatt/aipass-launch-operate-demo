import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
      <div className="login-shell">
        <div className="login-card stack">
          <div>
            <p className="hero__eyebrow" style={{ marginBottom: "0.5rem" }}>
              ถามคู่มือ · ศูนย์บริการตัวอย่าง
            </p>
            <h1 style={{ fontSize: "1.5rem" }}>ไม่พบหน้าที่ต้องการ</h1>
            <p className="small muted" style={{ marginTop: "0.5rem" }}>
              ลิงก์อาจเก่าหรือที่อยู่ไม่ครบ กลับไปเริ่มจากหน้าถามคำตอบหรือคู่มือบริการ
            </p>
          </div>
          <div className="row">
            <Link className="button" href="/">
              ไปหน้าถามคำตอบ
            </Link>
            <Link className="button button--ghost" href="/handbook/docs-v1" prefetch={false}>
              เปิดคู่มือบริการ
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
