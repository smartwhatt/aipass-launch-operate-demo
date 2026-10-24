import Link from "next/link";
import { notFound } from "next/navigation";
import { getShell } from "@/lib/shell";
import {
  CANONICAL_DOCUMENTS,
  DOCUMENT_KEYS,
  getCanonicalDocument,
  sectionAnchor,
} from "@/lib/retrieval/canonical";
import { formatThaiDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HandbookPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  const { viewer, active } = await getShell();

  if (!CANONICAL_DOCUMENTS[version]) notFound();

  if (!viewer || viewer.role === "outsider") {
    return (
      <div className="page">
        <div className="login-shell">
          <div className="login-card stack">
            <h1 style={{ fontSize: "1.4rem" }}>คู่มือนี้ต้องมีสิทธิ์จึงอ่านได้</h1>
            <p className="small muted">
              บัญชีผู้ใช้ภายนอกไม่ได้รับสิทธิ์อ่านคู่มือฉบับเต็ม ใช้บัญชีผู้ใช้ทดลองนำร่องหรือผู้ดูแลระบบ
            </p>
            <Link className="button" href="/login?next=/handbook/docs-v1">
              เข้าสู่ระบบ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const doc = getCanonicalDocument(version);
  const registered = active?.registeredDocuments.some((entry) => entry.docKey === version) ?? false;
  const isServed = active?.index?.docKey === version;

  return (
    <div className="page">
      <div className="stack stack-lg" style={{ paddingTop: "2.5rem", maxWidth: "48rem" }}>
        <div className="row-between">
          <div>
            <p className="hero__eyebrow" style={{ marginBottom: "0.5rem" }}>
              คู่มือ · ข้อมูลสมมติสำหรับการเรียน
            </p>
            <h1 style={{ fontSize: "1.8rem" }}>{doc.title}</h1>
            <p className="small muted" style={{ marginTop: "0.4rem" }}>
              ฉบับ <span className="mono">{doc.id}</span> · มีผลตั้งแต่{" "}
              {formatThaiDate(`${doc.effective_date}T00:00:00+07:00`)}
            </p>
          </div>
          <span className="badge">ข้อมูลสมมติ</span>
        </div>

        <div className="row small">
          <span className="faint">ฉบับ:</span>
          {DOCUMENT_KEYS.map((key) => (
            <Link
              key={key}
              href={`/handbook/${key}`}
              prefetch={false}
              className="badge"
              style={
                key === version
                  ? { borderColor: "var(--ink)", color: "var(--ink)" }
                  : undefined
              }
            >
              {key}
            </Link>
          ))}
        </div>

        <div className={isServed ? "notice notice--ok" : "notice notice--warn"}>
          <div className="notice__title">
            {isServed
              ? "ระบบกำลังตอบคำถามจากคู่มือฉบับนี้"
              : registered
                ? "ฉบับนี้ลงทะเบียนแล้ว แต่ยังไม่ได้เปิดใช้ดัชนี"
                : "ฉบับนี้ยังไม่ถูกลงทะเบียนในระบบ"}
          </div>
          <p className="small muted">
            {isServed
              ? `ดัชนีที่ใช้งานอยู่คือ ${active?.index?.indexKey} ซึ่งสร้างจาก ${doc.id}`
              : registered
                ? `ดัชนีที่ใช้งานอยู่คือ ${active?.index?.indexKey ?? "ไม่มี"} (สร้างจาก ${active?.index?.docKey ?? "ไม่มี"}) ต้องสร้างและเปิดใช้ดัชนีใหม่ก่อนระบบจะตอบจากฉบับนี้`
                : `ดัชนีที่ใช้งานอยู่คือ ${active?.index?.indexKey ?? "ไม่มี"} และรายการเอกสารยังไม่มีฉบับนี้`}
          </p>
          {viewer.role === "admin" ? (
            <p className="tiny faint" style={{ marginTop: "0.4rem" }}>
              เปลี่ยนดัชนีที่ใช้งานได้ที่ <Link href="/admin/demo">หน้าควบคุม</Link>
            </p>
          ) : null}
        </div>

        <div className="stack">
          {doc.sections.map((section) => (
            <section key={section.id} id={sectionAnchor(section.id)} className="card">
              <div className="row" style={{ gap: "0.6rem", alignItems: "baseline" }}>
                <span className="mono faint">{section.id}</span>
                <h2 style={{ fontSize: "1.05rem" }}>{section.title}</h2>
              </div>
              <p style={{ marginTop: "0.7rem", lineHeight: 1.85 }}>{section.text}</p>
              <p className="tiny faint" style={{ marginTop: "0.6rem" }}>
                ที่อยู่อ้างอิง: <span className="mono">/handbook/{doc.id}#{sectionAnchor(section.id)}</span>
              </p>
            </section>
          ))}
        </div>

        <div className="notice">
          <div className="notice__title">ขอบเขตของคู่มือฉบับนี้</div>
          <p className="small muted">
            เอกสารนี้ไม่ครอบคลุม: {doc.out_of_scope.join(" · ")} — ถ้าถามเรื่องเหล่านี้
            ระบบจะตอบว่าไม่มีข้อมูลในคู่มือ
          </p>
        </div>

        <div className="row">
          <Link className="button" href="/">
            กลับไปถามคำถาม
          </Link>
        </div>
      </div>
    </div>
  );
}
