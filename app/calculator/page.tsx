import Link from "next/link";
import { Calculator } from "@/components/calculator/calculator";
import { getShell } from "@/lib/shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "คำนวณต้นทุน AI App — ถามคู่มือ",
  robots: { index: false, follow: false },
};

export default async function CalculatorPage() {
  const { viewer } = await getShell();
  const canDownload = Boolean(viewer && viewer.role !== "outsider");

  return (
    <div className="page">
      <div className="stack stack-lg">
        <section className="hero" style={{ paddingBottom: 0 }}>
          <p className="hero__eyebrow">เครื่องคำนวณต้นทุน · ข้อมูลและราคาสมมติ</p>
          <h1>คำนวณต้นทุน AI App</h1>
          <p className="hero__lead">
            ประมาณต้นทุนรายเดือนจากการใช้งานจริง: จำนวนผู้ใช้ คำถามต่อวัน จำนวนการเรียกโมเดล
            และราคาต่อล้าน token ใช้สูตรเดียวกับไฟล์ Excel ที่แนบมาในชุดเผยแพร่
          </p>
          {!canDownload ? (
            <p className="small muted" style={{ marginTop: "0.75rem" }}>
              การดาวน์โหลดไฟล์ Excel ต้องเข้าสู่ระบบด้วยบัญชีผู้ใช้ทดลองนำร่องหรือผู้ดูแลระบบ{" "}
              <Link href="/login?next=/calculator">เข้าสู่ระบบ</Link>
            </p>
          ) : null}
        </section>
        <Calculator canDownload={canDownload} />
      </div>
    </div>
  );
}
