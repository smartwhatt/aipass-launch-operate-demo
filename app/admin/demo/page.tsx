import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import {
  appUsers,
  contactRequests,
  docIndexes,
  resetAudit,
} from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/state/active";
import { getBudgetSnapshot, getQuotaStatus, getRateStatus } from "@/lib/controls/admission";
import { SCENARIOS } from "@/lib/seed/scenarios";
import { formatThaiDate, formatThaiDateTime } from "@/lib/format";
import { ActionButton } from "@/components/admin/action-button";
import { IncidentEditor } from "@/components/admin/incident-editor";

export const dynamic = "force-dynamic";

const SCENARIO_DESCRIPTIONS: Record<string, string> = {
  "ep1-baseline": "จุดเริ่มต้น EP1: แอป 1.0.0, docs-v1 / index-v1, โหมดปกติ, pilot ใช้งานได้ outsider ถูกปฏิเสธ",
  "ep2-quota": "เหลือโควตา 1 ครั้งสำหรับผู้ใช้ pilot (ล้างตัวนับอัตราก่อน)",
  "ep2-budget-warning": "ใช้จ่าย 800 จาก 1,000 บาท พร้อมเหตุการณ์แจ้งเตือนที่ 80%",
  "ep2-budget-full": "ใช้จ่ายเต็ม 1,000 บาท ปฏิเสธการเรียก AI ใหม่ก่อนถึงผู้ให้บริการ",
  "ep2-provider-failure": "ผู้ให้บริการ AI ล่ม แต่ยังมีงบประมาณและโควตาเหลือ",
  "ep3-stale-index": "ลงทะเบียน docs-v2 แล้ว แต่ยังใช้ index-v1 พร้อมข้อมูล pilot 200 คำขอ",
  "ep3-incident": "สถานะเดิม + แบนเนอร์เหตุขัดข้อง และหยุดตอบคำถามเรื่องเวลาเปิด–ปิด",
  "ep3-fixed-preview": "สร้างและเปิดใช้ index-v2 จาก docs-v2 สำหรับตรวจใน Preview",
  "ep3-fixed-production": "เปิดใช้ index-v2 และบันทึกรุ่นสำหรับ Production",
};

export default async function AdminDemoPage() {
  await requireAdminPage("/admin/demo");
  const config = getConfig();
  const db = getDb();
  const active = await getActiveContext(db, config.DATA_NAMESPACE);

  const [pilot] = await db
    .select({ id: appUsers.id, displayName: appUsers.displayName })
    .from(appUsers)
    .where(
      and(eq(appUsers.namespace, config.DATA_NAMESPACE), eq(appUsers.username, "pilot")),
    )
    .limit(1);

  const quota = pilot ? await getQuotaStatus(config.DATA_NAMESPACE, pilot.id) : null;
  const rate = pilot ? await getRateStatus(config.DATA_NAMESPACE, pilot.id) : null;
  const budget = await getBudgetSnapshot(config.DATA_NAMESPACE);

  const indexes = await db
    .select({
      indexKey: docIndexes.indexKey,
      docKey: docIndexes.docKey,
      chunkCount: docIndexes.chunkCount,
      builtAt: docIndexes.builtAt,
    })
    .from(docIndexes)
    .where(eq(docIndexes.namespace, config.DATA_NAMESPACE))
    .orderBy(desc(docIndexes.builtAt));

  const recentResets = await db
    .select()
    .from(resetAudit)
    .where(eq(resetAudit.namespace, config.DATA_NAMESPACE))
    .orderBy(desc(resetAudit.createdAt))
    .limit(6);

  const recentContact = await db
    .select()
    .from(contactRequests)
    .where(eq(contactRequests.namespace, config.DATA_NAMESPACE))
    .orderBy(desc(contactRequests.createdAt))
    .limit(5);

  return (
    <div className="stack stack-lg">
      <section>
        <div className="row-between" style={{ marginBottom: "1rem" }}>
          <h2>สถานะปัจจุบัน</h2>
          <span className="tiny faint">ค่าทั้งหมดอ่านจาก PostgreSQL ไม่ใช่จากตัวแปรในโปรเซส</span>
        </div>
        <div className="grid-auto">
          <div className="metric">
            <span className="metric__label">ดัชนีที่ใช้งาน</span>
            <span className="metric__value mono" style={{ fontSize: "1.1rem" }}>
              {active.index?.indexKey ?? "ไม่มี"}
            </span>
            <span className="metric__foot">
              จาก {active.index?.docKey ?? "—"} · {active.configVersion}
            </span>
          </div>
          <div className="metric">
            <span className="metric__label">โหมดการสอน</span>
            <span className="metric__value mono" style={{ fontSize: "1.1rem" }}>
              {active.mode}
            </span>
            <span className="metric__foot">
              แบนเนอร์เหตุขัดข้อง: {active.incident.enabled ? "เปิด" : "ปิด"}
            </span>
          </div>
          <div className="metric">
            <span className="metric__label">โควตาวันนี้ (pilot)</span>
            <span className="metric__value">
              {quota ? `${quota.used}/${quota.limit}` : "—"}
            </span>
            <span className="metric__foot">
              {quota ? `เหลือ ${quota.remaining} · เริ่มใหม่ ${formatThaiDateTime(quota.resetAt)}` : "ไม่พบบัญชี pilot"}
            </span>
          </div>
          <div className="metric">
            <span className="metric__label">อัตราการถาม (60 วินาที)</span>
            <span className="metric__value">
              {rate ? `${rate.used}/${rate.limit}` : "—"}
            </span>
            <span className="metric__foot">หน้าต่างเลื่อน 60 วินาที</span>
          </div>
          <div className="metric">
            <span className="metric__label">งบประมาณเดือนนี้</span>
            <span className="metric__value">
              {budget.committedThb.toFixed(2)}
              <span className="faint" style={{ fontSize: "0.9rem", fontWeight: 400 }}>
                {" "}
                / {budget.limitThb.toFixed(0)} ฿
              </span>
            </span>
            <span className="metric__foot">
              {budget.percent}% · จองไว้ {budget.reservedThb.toFixed(2)} ·{" "}
              {budget.alertAt ? "แจ้งเตือน 80% แล้ว" : "ยังไม่ถึง 80%"}
            </span>
          </div>
          <div className="metric">
            <span className="metric__label">รุ่นแอปที่รันอยู่</span>
            <span className="metric__value mono" style={{ fontSize: "1.1rem" }}>
              v{config.APP_VERSION}
            </span>
            <span className="metric__foot">{config.APP_ENV} · {config.AI_MODE}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">สถานการณ์สำหรับการสอน</h2>
          <span className="tiny faint">
            รีเซ็ตเปลี่ยนข้อมูลและตัวควบคุมเท่านั้น ไม่เปลี่ยนโค้ดที่รันอยู่
          </span>
        </div>
        <div className="scenario-list">
          {SCENARIOS.map((scenario) => {
            const mismatch = scenario.required_app_version !== config.APP_VERSION;
            return (
              <div className="scenario" key={scenario.id}>
                <div>
                  <div className="row" style={{ gap: "0.5rem" }}>
                    <span className="scenario__id">{scenario.id}</span>
                    <span className={mismatch ? "badge badge--warn" : "badge"}>
                      ต้องใช้แอป v{scenario.required_app_version}
                    </span>
                    {scenario.environment ? (
                      <span className="badge">{scenario.environment}</span>
                    ) : null}
                  </div>
                  <p className="scenario__desc">{SCENARIO_DESCRIPTIONS[scenario.id] ?? ""}</p>
                </div>
                <ActionButton
                  label="ใช้สถานการณ์นี้"
                  confirmLabel="ยืนยันการรีเซ็ต"
                  endpoint="/api/admin/scenarios/reset"
                  body={{ scenario: scenario.id }}
                  disabled={!config.DEMO_CONTROLS_ENABLED}
                  disabledReason="DEMO_CONTROLS_ENABLED=false"
                  size="sm"
                />
              </div>
            );
          })}
        </div>
      </section>

      <div className="split-panels">
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">เอกสารและดัชนี</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>เอกสาร</th>
                  <th>มีผล</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {active.registeredDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      ยังไม่มีเอกสาร — รัน npm run demo:seed
                    </td>
                  </tr>
                ) : (
                  active.registeredDocuments.map((document) => (
                    <tr key={document.docKey}>
                      <td>
                        <span className="mono">{document.docKey}</span>
                        <div className="tiny faint">{document.title}</div>
                      </td>
                      <td className="nowrap">
                        {formatThaiDate(`${document.effectiveDate}T00:00:00+07:00`)}
                      </td>
                      <td>
                        {document.isActive ? (
                          <span className="badge badge--ok">ใช้งานอยู่</span>
                        ) : (
                          <span className="badge">ลงทะเบียนแล้ว</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ดัชนี</th>
                  <th>จากเอกสาร</th>
                  <th className="num">ข้อ</th>
                  <th>สร้างเมื่อ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {indexes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      ยังไม่มีดัชนี
                    </td>
                  </tr>
                ) : (
                  indexes.map((index) => (
                    <tr key={index.indexKey}>
                      <td className="mono">{index.indexKey}</td>
                      <td className="mono">{index.docKey}</td>
                      <td className="num">{index.chunkCount}</td>
                      <td className="tiny nowrap">{formatThaiDateTime(index.builtAt)}</td>
                      <td>
                        {index.indexKey === active.index?.indexKey ? (
                          <span className="badge badge--ok">ใช้งาน</span>
                        ) : (
                          <ActionButton
                            label="เปิดใช้"
                            endpoint="/api/admin/indexes/activate"
                            body={{ index: index.indexKey }}
                            size="sm"
                          />
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: "1rem", gap: "0.6rem" }}>
            <ActionButton
              label="ลงทะเบียน docs-v2"
              endpoint="/api/admin/documents/register"
              body={{ document: "docs-v2" }}
              disabled={!config.DEMO_CONTROLS_ENABLED}
              size="sm"
            />
            <ActionButton
              label="สร้าง index-v2"
              endpoint="/api/admin/indexes/build"
              body={{ docs: "docs-v2", index: "index-v2" }}
              disabled={!config.DEMO_CONTROLS_ENABLED}
              size="sm"
            />
          </div>
          <p className="tiny faint" style={{ marginTop: "0.6rem" }}>
            การลงทะเบียนเอกสารไม่เปลี่ยนดัชนีที่ใช้งาน ต้องสร้างและเปิดใช้ดัชนีแยกเสมอ
          </p>
        </section>

        <section className="card">
          <div className="card__head">
            <h2 className="card__title">แบนเนอร์เหตุขัดข้อง</h2>
          </div>
          <IncidentEditor
            enabled={active.incident.enabled}
            topic={active.incident.topic ?? "opening_hours"}
            message={active.incident.message}
            owner={active.incident.owner ?? "ทีมบริการศูนย์ (สมมติ)"}
            nextUpdate={active.incident.nextUpdateAt?.toISOString() ?? null}
          />

          <div className="card__head" style={{ marginTop: "1.75rem" }}>
            <h2 className="card__title">การรีเซ็ตล่าสุด</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>สถานการณ์</th>
                  <th>ผู้ทำ</th>
                </tr>
              </thead>
              <tbody>
                {recentResets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      ยังไม่มีการรีเซ็ต
                    </td>
                  </tr>
                ) : (
                  recentResets.map((row) => (
                    <tr key={row.id}>
                      <td className="tiny nowrap">{formatThaiDateTime(row.createdAt)}</td>
                      <td className="mono">{row.scenario}</td>
                      <td className="tiny">{row.actor}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card__head" style={{ marginTop: "1.75rem" }}>
            <h2 className="card__title">คำขอใช้ห้องประชุม (สมมติ)</h2>
            <Link className="tiny" href="/" prefetch={false}>
              เปิดแบบฟอร์ม
            </Link>
          </div>
          {recentContact.length === 0 ? (
            <p className="small muted">ยังไม่มีคำขอ — ฟอร์มอยู่ในช่องทางติดต่อบนหน้าแรก</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>เลขที่</th>
                    <th>ชื่อที่แสดง</th>
                    <th>จำนวน</th>
                  </tr>
                </thead>
                <tbody>
                  {recentContact.map((row) => (
                    <tr key={row.id}>
                      <td className="mono tiny">{row.reference}</td>
                      <td>{row.displayName}</td>
                      <td className="num">{row.attendees ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
