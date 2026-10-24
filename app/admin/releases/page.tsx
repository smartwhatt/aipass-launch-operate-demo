import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { getCommitSha, getConfig, environmentLabel } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { releases } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/auth/guards";
import { getActiveContext } from "@/lib/state/active";
import { getBudgetSnapshot } from "@/lib/controls/admission";
import { LIVE_MODEL_PRICES, livePricingStatus } from "@/lib/providers/pricing";
import { formatThaiDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  await requireAdminPage("/admin/releases");
  const config = getConfig();
  const db = getDb();
  const active = await getActiveContext(db, config.DATA_NAMESPACE);
  const budget = await getBudgetSnapshot(config.DATA_NAMESPACE);

  const rows = await db
    .select()
    .from(releases)
    .where(eq(releases.namespace, config.DATA_NAMESPACE))
    .orderBy(desc(releases.releasedAt))
    .limit(20);

  const pricingStatus = livePricingStatus(config.GEMINI_MODEL);
  const price = LIVE_MODEL_PRICES[config.GEMINI_MODEL];

  return (
    <div className="stack stack-lg">
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">สิ่งที่กำลังรันอยู่ในสภาพแวดล้อมนี้</h2>
          <span className="badge badge--ink">{environmentLabel()}</span>
        </div>
        <dl className="defs">
          {[
            ["แอป", `v${config.APP_VERSION}`],
            ["commit", getCommitSha()],
            ["คอนฟิก", active.configVersion],
            ["คู่มือ", active.index?.docKey ?? "—"],
            ["ดัชนี", active.index?.indexKey ?? "—"],
            ["โหมด", `${active.mode} · ${config.AI_MODE}`],
            ["namespace", config.DATA_NAMESPACE],
            ["พรอมป์ต์", "prompt-1"],
            ["โมเดล (live)", config.GEMINI_MODEL],
            [
              "ราคาโมเดล",
              pricingStatus === "unknown"
                ? "ไม่ทราบ — หยุดเรียก AI"
                : pricingStatus === "unverified"
                  ? "ยังไม่ตรวจสอบ — ต้องยืนยันก่อนใช้ live"
                  : "ตรวจสอบแล้ว",
            ],
            ["งบประมาณเดือนนี้", `${budget.committedThb.toFixed(2)} / ${budget.limitThb.toFixed(0)} บาท`],
          ].map(([key, value]) => (
            <div className="defs__row" key={key}>
              <dt className="defs__key">{key}</dt>
              <dd className="defs__value mono">{value}</dd>
            </div>
          ))}
        </dl>
        {price ? (
          <p className="tiny faint" style={{ marginTop: "0.75rem" }}>
            ราคาอ้างอิง: {price.source} · ตรวจล่าสุด {price.checkedDate ?? "ยังไม่ตรวจ"} ·
            ค่าเข้า ${price.inputUsdPerMillion}/ล้าน token · ค่า out ${price.outputUsdPerMillion}/ล้าน token
          </p>
        ) : null}
      </section>

      <section className="notice notice--warn">
        <div className="notice__title">การย้อนรุ่น (rollback) ไม่ย้อนฐานข้อมูล</div>
        <p className="small">
          ถ้าย้อนโค้ด ตัวชี้ดัชนีใน PostgreSQL ยังชี้ที่ index-v2 และเอกสารที่ลงทะเบียนไว้ยังอยู่
          ต้องย้อนเป็นคู่: โค้ด + คอนฟิก/ดัชนี ตามรายการด้านล่าง ถ้าไม่มีคู่ที่ปลอดภัย ให้ใช้คู่มือที่ตรวจสอบแล้วแทน
        </p>
        <p className="tiny faint" style={{ marginTop: "0.4rem" }}>
          ก่อน migration หรือรีเซ็ต ควรเก็บ snapshot ของฐานข้อมูลไว้เสมอ
        </p>
      </section>

      <section>
        <div className="row-between" style={{ marginBottom: "0.75rem" }}>
          <h2 className="card__kicker" style={{ letterSpacing: "0.08em" }}>
            รุ่นและคู่คอนฟิกที่เผยแพร่
          </h2>
          <span className="tiny faint">บันทึกผ่าน POST /api/admin/releases</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>สภาพแวดล้อม</th>
                <th>แอป</th>
                <th>คอนฟิก</th>
                <th>คู่มือ / ดัชนี</th>
                <th>commit</th>
                <th>ผู้รับผิดชอบ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    ยังไม่มีบันทึก — ใช้ <span className="mono">npm run demo:seed</span> หรือบันทึกผ่าน API
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="tiny nowrap">{formatThaiDateTime(row.releasedAt)}</td>
                    <td className="tiny">{row.environment}</td>
                    <td className="mono">v{row.appVersion}</td>
                    <td className="mono">{row.configVersion}</td>
                    <td className="mono tiny">
                      {row.documentVersion ?? "—"} / {row.indexVersion ?? "—"}
                    </td>
                    <td className="mono tiny">{row.commitSha?.slice(0, 12) ?? "—"}</td>
                    <td className="tiny">{row.owner ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">วิธีฟื้นบริการ</h2>
        </div>
        <ol className="small muted" style={{ display: "grid", gap: "0.5rem" }}>
          <li>เปิดแบนเนอร์เหตุขัดข้องถ้าคำตอบเรื่องเวลาเปิด–ปิดยังผิด และชี้ไปที่คู่มือฉบับที่ตรวจสอบแล้ว</li>
          <li>
            ตรวจว่า <span className="mono">docs-v2</span> ถูกลงทะเบียนแล้วหรือยัง แล้วสร้าง{" "}
            <span className="mono">index-v2</span> จากหน้า /admin/demo
          </li>
          <li>เปิดใช้ index-v2 ใน Preview ก่อน รัน Q01–Q10 ให้ผ่านเกณฑ์ แล้วจึงเปิดใช้ใน Production</li>
          <li>ยืนยันด้วยคำถามเดิมและเปิดลิงก์อ้างอิงจริง ไม่ใช่ดูแค่สถานะ deploy</li>
          <li>
            ถ้าต้องย้อน ให้ระบุคู่ แอป + คอนฟิก/ดัชนี ที่ฟื้นพร้อมกัน และบันทึกไว้ที่หน้านี้
          </li>
        </ol>
        <div className="row" style={{ marginTop: "1rem" }}>
          <Link className="button button--ghost" href="/admin/demo" prefetch={false}>
            ไปหน้าควบคุมดัชนี
          </Link>
          <Link className="button button--quiet" href="/admin/evaluations" prefetch={false}>
            ไปหน้าการประเมิน
          </Link>
        </div>
      </section>
    </div>
  );
}
