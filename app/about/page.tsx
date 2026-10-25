import Link from "next/link";
import { getShell } from "@/lib/shell";
import { getCommitSha, environmentLabel } from "@/lib/config";
import { getCanonicalDocument } from "@/lib/retrieval/canonical";
import { handbookLabelWithDate, formatThaiDate } from "@/lib/format";
import { PROMPT_VERSION } from "@/lib/providers/prompt";
import { ContactPanel } from "@/components/contact-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "เกี่ยวกับบริการ — ถามคู่มือ",
  robots: { index: false, follow: false },
};

export default async function AboutPage() {
  const { viewer, config, active } = await getShell();
  const docKey = active?.index?.docKey ?? config.DOCS_VERSION;
  const doc = (() => {
    try {
      return getCanonicalDocument(docKey);
    } catch {
      return null;
    }
  })();

  return (
    <div className="page">
      <div className="stack stack-lg" style={{ paddingTop: "2.5rem", maxWidth: "46rem" }}>
        <div>
          <p className="hero__eyebrow">ศูนย์บริการตัวอย่าง · ข้อมูลสมมติสำหรับการเรียน</p>
          <h1 style={{ fontSize: "1.9rem", marginTop: "0.5rem" }}>เกี่ยวกับบริการนี้</h1>
        </div>

        <section className="stack stack-sm">
          <h2 style={{ fontSize: "1.05rem" }}>บริการนี้ทำอะไร</h2>
          <p className="muted">
            ถามคู่มือช่วยตอบคำถามเกี่ยวกับศูนย์บริการตัวอย่าง ระบบค้นคู่มือบริการฉบับที่ใช้งานอยู่
            แล้วตอบพร้อมแหล่งอ้างอิงทุกครั้ง ถ้าคู่มือไม่มีคำตอบ ระบบจะบอกว่าไม่มีข้อมูล
            และจะไม่เดาเวลา ค่าธรรมเนียม เบอร์โทร หรือลิงก์ขึ้นมาเอง
          </p>
        </section>

        <section className="stack stack-sm">
          <h2 style={{ fontSize: "1.05rem" }}>คู่มือที่ใช้ตอบ</h2>
          {doc ? (
            <div className="card card--panel">
              <p className="card__title">{doc.title}</p>
              <p className="small muted" style={{ marginTop: "0.35rem" }}>
                มีผลตั้งแต่ {formatThaiDate(`${doc.effective_date}T00:00:00+07:00`)} ·{" "}
                {doc.sections.length} ข้อ
              </p>
              <div className="row" style={{ marginTop: "0.9rem" }}>
                <Link
                  className="button button--ghost button--sm"
                  href={`/handbook/${docKey}`}
                  prefetch={false}
                >
                  อ่านคู่มือฉบับนี้
                </Link>
              </div>
            </div>
          ) : (
            <p className="muted">ยังไม่มีคู่มือที่เปิดใช้งาน</p>
          )}
          {active?.latestDocKey && active.latestDocKey !== docKey ? (
            <p className="small">
              มีคู่มือฉบับใหม่กว่าแล้ว ({handbookLabelWithDate(active.latestDocKey, latestDate(active.latestDocKey))}) แต่ระบบยังตอบจากฉบับที่แสดงด้านบน
            </p>
          ) : null}
        </section>

        <section className="stack stack-sm">
          <h2 style={{ fontSize: "1.05rem" }}>ขอบเขตและความเป็นส่วนตัว</h2>
          <ul className="muted" style={{ display: "grid", gap: "0.45rem" }}>
            <li>ระบบตอบจากคู่มือฉบับที่ระบุไว้เท่านั้น ไม่ใช้ความรู้นอกคู่มือ</li>
            <li>ระบบไม่สร้างค่าใช้จ่าย เบอร์โทร หรือลิงก์ที่ไม่ปรากฏในคู่มือ</li>
            <li>ไม่ต้องพิมพ์เลขบัตรประชาชนหรือข้อมูลส่วนตัวลงในช่องคำถาม</li>
            <li>คำถามและผลลัพธ์ถูกเก็บไว้ในฐานข้อมูลของเดโมเพื่อการสอนและการตรวจสอบ</li>
            <li>ข้อมูล คำตอบ และราคาทั้งหมดเป็นข้อมูลสมมติ ไม่ใช่ข้อมูลของหน่วยงานจริง</li>
          </ul>
        </section>

        <section className="stack stack-sm">
          <h2 style={{ fontSize: "1.05rem" }}>ติดต่อ</h2>
          <p className="muted">
            ใช้แบบฟอร์มภายในแอปเพื่อขอใช้ห้องประชุมหรือสอบถามเจ้าหน้าที่
            ระบบนี้ไม่มีอีเมลหรือเบอร์โทรจริง และไม่ส่งข้อความออกนอกระบบ
          </p>
          <ContactPanel triggerLabel="เปิดแบบฟอร์มติดต่อศูนย์" />
        </section>

        <section className="stack stack-sm">
          <h2 style={{ fontSize: "1.05rem" }}>สถานะระบบ</h2>
          <p className="tiny faint">หน้านี้มีไว้ให้ผู้ดูแลการอบรมตรวจรุ่นที่กำลังใช้งาน</p>
          <dl className="defs small">
            {[
              ["สภาพแวดล้อม", environmentLabel()],
              ["รุ่นแอป", `v${config.APP_VERSION}`],
              ["commit", getCommitSha()],
              ["คู่มือ", `${handbookLabelWithDate(docKey, doc?.effective_date)} (${docKey})`],
              ["ดัชนี", active?.index?.indexKey ?? "ไม่มี"],
              ["โหมดข้อมูล", config.AI_MODE === "fixture" ? "ข้อมูลจำลอง / Fixture mode" : "Live mode"],
              ["พรอมป์ต์", PROMPT_VERSION],
              ["โมเดล", config.AI_MODE === "fixture" ? "fixture-handbook-v1" : config.GEMINI_MODEL],
              ["namespace", config.DATA_NAMESPACE],
              ["ผู้ดูแลระบบ", viewer?.role === "admin" ? viewer.displayName : "ทีมบริการศูนย์ (สมมติ)"],
            ].map(([key, value]) => (
              <div className="defs__row" key={key}>
                <dt className="defs__key">{key}</dt>
                <dd className="defs__value mono">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="tiny">
            <Link href="/api/health">ตรวจสอบสถานะระบบ (JSON)</Link>
          </p>
        </section>
      </div>
    </div>
  );
}

function latestDate(docKey: string): string | null {
  try {
    return getCanonicalDocument(docKey).effective_date;
  } catch {
    return null;
  }
}
