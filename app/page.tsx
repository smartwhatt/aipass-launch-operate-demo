import Link from "next/link";
import { getShell } from "@/lib/shell";
import { getQuotaStatus } from "@/lib/controls/admission";
import { getCanonicalDocument, sectionAnchor } from "@/lib/retrieval/canonical";
import { formatThaiDate, formatThaiDateTime, handbookLabel } from "@/lib/format";
import { QuestionForm } from "@/components/question-form";
import { IncidentBanner } from "@/components/incident-banner";
import { ContactPanel } from "@/components/contact-panel";
import { handbookFreshness } from "@/lib/state/freshness";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { viewer, config, active } = await getShell();
  const canAsk = Boolean(viewer && (viewer.role === "pilot" || viewer.role === "admin"));
  const isAdmin = viewer?.role === "admin";

  const disabledReason = !viewer
    ? "เข้าสู่ระบบเพื่อถามคำถามจากคู่มือบริการ"
    : viewer.role === "outsider"
      ? "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานคู่มือบริการ ติดต่อเจ้าหน้าที่ศูนย์เพื่อขอสิทธิ์"
      : null;

  const activeDocKey = active?.index?.docKey ?? null;
  const activeDoc = activeDocKey ? getCanonicalDocument(activeDocKey) : null;
  const handbookHref = activeDocKey ? `/handbook/${activeDocKey}` : "/handbook/docs-v1";
  const checkedDocHref = `/handbook/${active?.latestDocKey ?? "docs-v2"}#s2-1`;

  const quota =
    canAsk && viewer ? await getQuotaStatus(config.DATA_NAMESPACE, viewer.id) : null;
  const quotaIsTight = Boolean(quota && quota.remaining <= 5);

  // Catching a stale index before a learner does is the point of the EP3 fix.
  const freshness = handbookFreshness(active?.index?.docKey, active?.latestDocKey);
  const latestDoc = freshness.latestDocKey
    ? safeDocument(freshness.latestDocKey)
    : null;

  return (
    <div className="page">
      <section className="hero">
        <p className="hero__eyebrow">ศูนย์บริการตัวอย่าง · คู่มือบริการ</p>
        <h1>ถามคู่มือ</h1>
        <p className="hero__lead">
          พิมพ์คำถามเกี่ยวกับศูนย์บริการตัวอย่าง ระบบจะค้นคู่มือฉบับที่ใช้งานอยู่
          แล้วตอบพร้อมแหล่งอ้างอิง ถ้าคู่มือไม่มีคำตอบ ระบบจะบอกว่าไม่มีข้อมูลแทนการเดา
        </p>
      </section>

      {active?.incident.enabled ? (
        <div style={{ marginBottom: "2rem" }}>
          <IncidentBanner incident={active.incident} checkedHandbookHref={checkedDocHref} />
        </div>
      ) : null}

      {freshness.stale ? (
        <div className="notice notice--warn" style={{ marginBottom: "2rem" }}>
          <div className="notice__title">คู่มือฉบับใหม่ยังไม่ถูกใช้ตอบ</div>
          <p className="small">
            มี{handbookLabel(freshness.latestDocKey)}
            {latestDoc
              ? ` (มีผล ${formatThaiDate(`${latestDoc.effective_date}T00:00:00+07:00`)})`
              : ""}{" "}
            แล้ว แต่ระบบยังตอบจาก{handbookLabel(freshness.activeDocKey)} —
            ถ้าคำตอบเรื่องเวลาเปิด–ปิดไม่ตรง ให้เปิดฉบับล่าสุดหรือแจ้งเจ้าหน้าที่
          </p>
          <p className="row small" style={{ marginTop: "0.6rem", gap: "0.6rem" }}>
            <Link
              className="button button--ghost button--sm"
              href={`/handbook/${freshness.latestDocKey}#s2-1`}
              prefetch={false}
            >
              เปิดคู่มือฉบับล่าสุด
            </Link>
            {isAdmin ? (
              <Link className="button button--quiet button--sm" href="/admin/demo">
                ไปหน้ากำหนดค่าคู่มือ
              </Link>
            ) : null}
          </p>
        </div>
      ) : null}

      {!active?.index ? (
        <div className="notice notice--danger" style={{ marginBottom: "2rem" }}>
          <div className="notice__title">ยังไม่มีคู่มือที่เปิดใช้งาน</div>
          <p className="small">
            ระบบยังไม่พร้อมตอบคำถาม ผู้ดูแลระบบต้องนำเข้าคู่มือและเปิดใช้ก่อน
            จากนั้นจึงใช้งานหน้านี้ได้
          </p>
        </div>
      ) : null}

      <div className="stack stack-lg">
        <div>
          {quotaIsTight && quota ? (
            <p className="quota-note" role="status">
              {quota.remaining === 0
                ? `ใช้คำถามครบ ${quota.limit} ครั้งสำหรับวันนี้แล้ว`
                : `เหลือคำถามอีก ${quota.remaining} ครั้งสำหรับวันนี้`}
              <span className="faint"> · เริ่มใหม่ {formatThaiDateTime(quota.resetAt)}</span>
            </p>
          ) : null}

          <QuestionForm
            canAsk={canAsk}
            disabledReason={disabledReason}
            handbookHref={handbookHref}
            isAdmin={Boolean(isAdmin)}
          />
        </div>

        <div className="grid-2">
          <section className="card" style={{ border: 0 }}>
            <div className="card__kicker">คู่มือบริการ</div>
            <h2 style={{ marginTop: "0.5rem" }}>
              {activeDoc?.title ?? "ยังไม่มีคู่มือที่เปิดใช้"}
            </h2>
            {activeDoc ? (
              <div className="small muted" style={{ marginTop: "0.5rem" }}>
                <p>มีผลตั้งแต่ {formatThaiDate(`${activeDoc.effective_date}T00:00:00+07:00`)}</p>
                <p>
                  {activeDoc.sections.length} ข้อ · ระบบตอบจากฉบับนี้
                </p>
              </div>
            ) : (
              <p className="small muted">ผู้ดูแลระบบต้องนำเข้าคู่มือก่อนเปิดใช้งาน</p>
            )}
            <div className="row" style={{ marginTop: "1.1rem" }}>
              <Link className="button button--ghost" href={handbookHref} prefetch={false}>
                อ่านคู่มือ
              </Link>
              {activeDoc ? (
                <Link
                  className="button button--quiet"
                  href={`${handbookHref}#${sectionAnchor("2.1")}`}
                  prefetch={false}
                >
                  เวลาเปิด–ปิด
                </Link>
              ) : null}
            </div>
          </section>

          <section className="card" style={{ border: 0 }}>
            <div className="card__kicker">ขอบเขตและข้อจำกัด</div>
            <ul className="small muted" style={{ marginTop: "0.75rem", display: "grid", gap: "0.45rem" }}>
              <li>ตอบจากคู่มือฉบับที่ระบุด้านบนเท่านั้น ไม่ใช้ความรู้นอกคู่มือ</li>
              <li>ไม่สร้างเบอร์โทร ลิงก์ หรือค่าธรรมเนียมที่คู่มือไม่ได้ระบุ</li>
              <li>ห้ามส่งเลขบัตรประชาชนหรือข้อมูลส่วนตัวในช่องคำถาม</li>
              <li>ข้อมูล คำตอบ และราคาทั้งหมดเป็นข้อมูลสมมติสำหรับการเรียน</li>
            </ul>
            <div style={{ marginTop: "1.1rem" }}>
              <ContactPanel triggerLabel="ติดต่อศูนย์ / ขอใช้ห้องประชุม" />
            </div>
          </section>
        </div>

        <p className="tiny faint">
          พบคำตอบไม่ตรงกับคู่มือ? กด “ต้องแก้ไข” ใต้คำตอบ หรือติดต่อศูนย์ผ่านแบบฟอร์มในแอป
        </p>
      </div>
    </div>
  );
}

function safeDocument(docKey: string) {
  try {
    return getCanonicalDocument(docKey);
  } catch {
    return null;
  }
}
