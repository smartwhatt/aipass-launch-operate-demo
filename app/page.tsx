import Link from "next/link";
import { getShell } from "@/lib/shell";
import { getQuotaStatus } from "@/lib/controls/admission";
import { getCanonicalDocument, sectionAnchor } from "@/lib/retrieval/canonical";
import { formatThaiDate, formatThaiDateTime } from "@/lib/format";
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
    ? "แอปนี้ต้องเข้าสู่ระบบก่อนถามคำถาม บัญชีสำหรับการสอนสร้างด้วย npm run setup"
    : viewer.role === "outsider"
      ? "บัญชีผู้ใช้ภายนอกไม่ได้รับสิทธิ์ถามคำถามหรืออ่านคู่มือฉบับเต็ม ใช้บัญชีผู้ใช้ทดลองนำร่องสำหรับการสาธิต"
      : null;

  const activeDocKey = active?.index?.docKey ?? null;
  const activeDoc = activeDocKey ? getCanonicalDocument(activeDocKey) : null;
  const handbookHref = activeDocKey ? `/handbook/${activeDocKey}` : "/handbook/docs-v1";
  const checkedDocHref = `/handbook/${active?.latestDocKey ?? "docs-v2"}#s2-1`;

  const quota =
    canAsk && viewer ? await getQuotaStatus(config.DATA_NAMESPACE, viewer.id) : null;

  // Catching a stale index before a learner does is the point of the EP3 fix.
  const freshness = handbookFreshness(active?.index?.docKey, active?.latestDocKey);

  return (
    <div className="page">
      <section className="hero">
        <p className="hero__eyebrow">ศูนย์บริการตัวอย่าง · ข้อมูลสมมติสำหรับการเรียน</p>
        <h1>ถามคู่มือ</h1>
        <p className="hero__lead">
          พิมพ์คำถามเกี่ยวกับศูนย์บริการตัวอย่าง แอปจะค้นคู่มือฉบับที่ใช้งานอยู่
          แล้วตอบพร้อมแหล่งอ้างอิง ถ้าคู่มือไม่มีคำตอบ แอปจะบอกว่าไม่มีข้อมูลแทนการเดา
        </p>
      </section>

      {active?.incident.enabled ? (
        <div style={{ marginBottom: "2rem" }}>
          <IncidentBanner incident={active.incident} checkedHandbookHref={checkedDocHref} />
        </div>
      ) : null}

      {freshness.stale ? (
        <div className="notice notice--warn" style={{ marginBottom: "2rem" }}>
          <div className="notice__title">คู่มือฉบับล่าสุดยังไม่ถูกใช้ตอบ</div>
          <p className="small">
            ระบบลงทะเบียน <span className="mono">{freshness.latestDocKey}</span> แล้ว แต่ยังตอบจาก{" "}
            <span className="mono">{freshness.activeDocKey}</span> — ถ้าคำตอบเรื่องเวลาเปิด–ปิดไม่ตรง
            ให้เปิดคู่มือฉบับล่าสุดหรือแจ้งผู้ดูแลระบบ
          </p>
          <p className="row small" style={{ marginTop: "0.6rem", gap: "0.6rem" }}>
            <Link className="button button--ghost button--sm" href={`/handbook/${freshness.latestDocKey}#s2-1`} prefetch={false}>
              เปิดคู่มือฉบับล่าสุด
            </Link>
            {isAdmin ? (
              <Link className="button button--quiet button--sm" href="/admin/demo">
                สร้างและเปิดใช้ดัชนีใหม่
              </Link>
            ) : null}
          </p>
        </div>
      ) : null}

      {!active?.index ? (
        <div className="notice notice--danger" style={{ marginBottom: "2rem" }}>
          <div className="notice__title">ยังไม่มีดัชนีคู่มือที่เปิดใช้งาน</div>
          <p className="small">
            ฐานข้อมูลนี้ยังไม่พร้อมตอบคำถาม ผู้ดูแลระบบต้องรัน <span className="mono">npm run demo:seed</span>{" "}
            แล้วเลือกสถานการณ์ในหน้า <Link href="/admin/demo">หน้าควบคุม</Link>
          </p>
        </div>
      ) : null}

      <div className="stack stack-lg">
        <div>
          {quota ? (
            <div
              className="env-strip"
              style={{ borderTop: 0, paddingBottom: "0.85rem", justifyContent: "flex-start" }}
            >
              <span>โควตาวันนี้</span>
              <span className="env-strip__sep">/</span>
              <span>
                ใช้ไป {quota.used} จาก {quota.limit} ครั้ง
                {quota.remaining <= 1 ? ` · เหลือ ${quota.remaining} ครั้ง` : ""}
              </span>
              <span className="env-strip__sep">/</span>
              <span>เริ่มใหม่ {formatThaiDateTime(quota.resetAt)}</span>
            </div>
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
            <div className="card__kicker">คู่มือที่ใช้งานอยู่</div>
            <h2 style={{ marginTop: "0.5rem" }}>
              {activeDoc?.title ?? "ยังไม่มีคู่มือที่เปิดใช้"}
            </h2>
            {activeDoc ? (
              <div className="small muted" style={{ marginTop: "0.5rem" }}>
                <p>
                  ฉบับ {activeDoc.id} · มีผล {formatThaiDate(`${activeDoc.effective_date}T00:00:00+07:00`)}
                </p>
                <p>
                  ดัชนี {active?.index?.indexKey} · {activeDoc.sections.length} ข้อ
                </p>
              </div>
            ) : (
              <p className="small muted">ผู้ดูแลระบบต้องนำเข้าคู่มือก่อนเปิดใช้งาน</p>
            )}
            <div className="row" style={{ marginTop: "1.1rem" }}>
              <Link className="button button--ghost" href={handbookHref} prefetch={false}>
                อ่านคู่มือฉบับเต็ม
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
          ผู้รับผิดชอบระบบ: ทีมการสอน (สมมติ) · แจ้งคำตอบผิดได้จากปุ่ม “ต้องแก้ไข” ใต้คำตอบ ·
          ช่องทางแจ้งเหตุคือหน้าควบคุมของผู้ดูแลระบบ
        </p>
      </div>
    </div>
  );
}
