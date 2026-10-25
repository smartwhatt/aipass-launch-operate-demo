import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { requests } from "@/lib/db/schema";
import { requireAdminPage } from "@/lib/auth/guards";
import { getTrace } from "@/lib/telemetry/requests";
import { getActiveContext } from "@/lib/state/active";
import { getCanonicalDocument, sectionAnchor } from "@/lib/retrieval/canonical";
import { formatThaiDateTime, STATUS_LABELS } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { CitationList } from "@/components/citation-list";
import { ActionButton } from "@/components/admin/action-button";

export const dynamic = "force-dynamic";

export default async function TracePage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  await requireAdminPage("/admin/demo");
  const { requestId } = await params;
  const config = getConfig();
  const db = getDb();
  const trace = await getTrace(db, config.DATA_NAMESPACE, decodeURIComponent(requestId));

  if (!trace) {
    const recent = await db
      .select({
        requestId: requests.requestId,
        dataset: requests.dataset,
        status: requests.status,
        createdAt: requests.createdAt,
      })
      .from(requests)
      .where(eq(requests.namespace, config.DATA_NAMESPACE))
      .orderBy(desc(requests.createdAt))
      .limit(6);

    return (
      <div className="stack stack-lg">
        <div>
          <Link className="tiny" href="/admin/dashboard" prefetch={false}>
            ← กลับแดชบอร์ด
          </Link>
          <h2 className="mono" style={{ marginTop: "0.4rem", fontSize: "1.25rem" }}>
            {decodeURIComponent(requestId)}
          </h2>
        </div>

        <div className="notice notice--warn">
          <div className="notice__title">ไม่พบคำขอนี้ในฐานข้อมูลของสภาพแวดล้อมนี้</div>
          <p className="small">
            ร่องรอยจะถูกเก็บเมื่อคำขอถูกบันทึกไว้แล้วเท่านั้น คำขอตัวอย่างอย่าง{" "}
            <span className="mono">DEMO-R042</span> มาจากชุดข้อมูล pilot ย้อนหลัง
            ซึ่งโหลดด้วยสถานการณ์ <span className="mono">ep3-stale-index</span> หรือ{" "}
            <span className="mono">ep3-incident</span> สถานการณ์ปัจจุบันยังไม่โหลดชุดนั้น
          </p>
          <div className="row" style={{ marginTop: "0.9rem", gap: "0.6rem" }}>
            <ActionButton
              label="โหลดชุดข้อมูลตัวอย่าง"
              confirmLabel="ยืนยันการโหลด"
              endpoint="/api/admin/scenarios/reset"
              body={{ scenario: "ep3-stale-index" }}
              variant="primary"
              size="sm"
            />
            <Link className="button button--ghost button--sm" href="/admin/demo">
              เลือกสถานการณ์เอง
            </Link>
          </div>
        </div>

        <section>
          <h3 className="card__kicker" style={{ letterSpacing: "0.08em", marginBottom: "0.6rem" }}>
            คำขอล่าสุดในชุดข้อมูลนี้
          </h3>
          {recent.length === 0 ? (
            <p className="small muted">
              ยังไม่มีคำขอในสภาพแวดล้อมนี้ เริ่มจากหน้าถามคำตอบหรือโหลดชุดข้อมูลตัวอย่าง
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>คำขอ</th>
                    <th>ชุดข้อมูล</th>
                    <th>สถานะ</th>
                    <th>เมื่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={row.requestId}>
                      <td>
                        <Link
                          className="mono tiny"
                          href={`/admin/traces/${encodeURIComponent(row.requestId)}`}
                          prefetch={false}
                        >
                          {row.requestId}
                        </Link>
                      </td>
                      <td className="mono tiny">{row.dataset}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="tiny nowrap">{formatThaiDateTime(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  const active = await getActiveContext(db, config.DATA_NAMESPACE);
  const { request, calls, spans, actorName } = trace;

  const totalMs = Math.max(
    request.latencyMs ?? 0,
    ...spans.map((span) => span.startOffsetMs + span.durationMs),
    1,
  );

  const stale =
    active.latestDocKey !== null && request.documentVersion !== active.latestDocKey;
  const newestDoc = active.latestDocKey ?? active.index?.docKey ?? null;
  const newestSection = newestDoc
    ? (() => {
        try {
          const doc = getCanonicalDocument(newestDoc);
          return doc.sections.find((section) => section.id === "2.1") ?? doc.sections[0];
        } catch {
          return null;
        }
      })()
    : null;

  const cost = calls.reduce((sum, call) => sum + Number(call.costThb), 0);
  return (
    <div className="stack stack-lg">
      <div className="row-between">
        <div>
          <Link className="tiny" href="/admin/dashboard" prefetch={false}>
            ← กลับแดชบอร์ด
          </Link>
          <h2 className="mono" style={{ marginTop: "0.4rem", fontSize: "1.25rem" }}>
            {request.requestId}
          </h2>
          <p className="small muted">{request.question}</p>
        </div>
        <div className="row" style={{ gap: "0.5rem" }}>
          <StatusBadge status={request.status} />
          <span className="badge">{request.mode === "fixture" ? "Fixture mode" : "Live mode"}</span>
          <span className="badge">{request.dataset}</span>
        </div>
      </div>

      {stale && newestSection ? (
        <div className="notice notice--warn">
          <div className="notice__title">คำตอบนี้มาจากคู่มือฉบับเก่า</div>
          <p className="small">
            ร่องรอยนี้บันทึกไว้ด้วย <span className="mono">{request.documentVersion}</span> /{" "}
            <span className="mono">{request.indexVersion}</span> ขณะที่ฉบับล่าสุดที่ลงทะเบียนคือ{" "}
            <span className="mono">{newestDoc}</span>{" "}
            <Link href={`/handbook/${newestDoc}#${sectionAnchor(newestSection.id)}`} prefetch={false}>
              เปิดข้อ {newestSection.id} ของฉบับล่าสุด
            </Link>
          </p>
          <p className="tiny faint" style={{ marginTop: "0.4rem" }}>
            ร่องรอยเดิมไม่เปลี่ยนเมื่อแก้ดัชนี — เป็นหลักฐานของสิ่งที่เกิดขึ้นจริงในตอนนั้น
          </p>
        </div>
      ) : null}

      <div className="split-panels">
        <section className="card">
          <div className="card__head">
            <h2 className="card__title">เวอร์ชันที่บันทึกไว้</h2>
            <span className="tiny faint">snapshot ณ เวลาที่เกิดคำขอ</span>
          </div>
          <dl className="defs">
            {[
              ["แอป", request.appVersion],
              ["คอนฟิก", request.configVersion],
              ["พรอมป์ต์", request.promptVersion],
              ["คู่มือ", request.documentVersion ?? "—"],
              ["ดัชนี", request.indexVersion ?? "—"],
              ["โมเดล", request.modelId ?? "—"],
              ["ราคา", request.pricingVersion ?? "—"],
              ["สภาพแวดล้อม", `${request.environment} · ${actorName ?? request.actorRef}`],
              ["รับคำขอ", formatThaiDateTime(request.admittedAt)],
              ["เสร็จสิ้น", request.completedAt ? formatThaiDateTime(request.completedAt) : "—"],
            ].map(([key, value]) => (
              <div className="defs__row" key={key}>
                <dt className="defs__key">{key}</dt>
                <dd className="defs__value mono">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card">
          <div className="card__head">
            <h2 className="card__title">ช่วงเวลา (spans)</h2>
            <span className="tiny faint">
              รวม {(totalMs / 1000).toFixed(2)} วินาที · {calls.length} model call
            </span>
          </div>
          <div className="timeline">
            {spans.length === 0 ? (
              <p className="small muted">ไม่มี span บันทึกไว้สำหรับคำขอนี้</p>
            ) : (
              spans.map((span) => {
                const left = (span.startOffsetMs / totalMs) * 100;
                const width = Math.max(0.6, (span.durationMs / totalMs) * 100);
                const isError = String(span.attributes?.status ?? "") === "error";
                return (
                  <div className="timeline__row" key={span.id}>
                    <span className="timeline__name" title={span.name}>
                      {span.name}
                    </span>
                    <span className="timeline__bar">
                      <span
                        className={isError ? "timeline__fill timeline__fill--error" : "timeline__fill"}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    </span>
                    <span className="timeline__ms">{span.durationMs} ms</span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card__head">
          <h2 className="card__title">คำตอบและผลลัพธ์</h2>
          <span className="tiny faint">
            ต้นทุน {" "}
            {new Intl.NumberFormat("th-TH", {
              minimumFractionDigits: 4,
              maximumFractionDigits: 4,
            }).format(cost)}{" "}
            บาท
          </span>
        </div>
        <p style={{ fontSize: "1.05rem", lineHeight: 1.8 }}>{request.answer ?? "—"}</p>
        {request.explanation ? (
          <p className="small muted" style={{ marginTop: "0.6rem" }}>
            {request.explanation}
            {request.nextAction ? ` — ${request.nextAction}` : ""}
          </p>
        ) : null}
        <CitationList citations={request.citations ?? []} />

        <div className="card__head" style={{ marginTop: "1.75rem" }}>
          <h2 className="card__title">ข้อที่ค้นได้ (retrieved)</h2>
          <span className="tiny faint">at most three sections</span>
        </div>
        {(request.retrieved ?? []).length === 0 ? (
          <p className="small muted">ไม่มีข้อที่ค้นได้</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ข้อ</th>
                  <th>ชื่อข้อ</th>
                  <th className="num">คะแนน</th>
                </tr>
              </thead>
              <tbody>
                {(request.retrieved ?? []).map((hit) => (
                  <tr key={hit.sectionId}>
                    <td className="mono">{hit.sectionId}</td>
                    <td>{hit.title}</td>
                    <td className="num">{hit.score.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card__head" style={{ marginTop: "1.75rem" }}>
          <h2 className="card__title">การเรียกโมเดล</h2>
          <span className="tiny faint">
            ความพยายามซ้ำจะเพิ่ม model call แต่ไม่เพิ่มจำนวนคำขอ
          </span>
        </div>
        <div className="table-wrap">
          <table className="table table--numeric">
            <thead>
              <tr>
                <th>ครั้งที่</th>
                <th>ผู้ให้บริการ</th>
                <th>โมเดล</th>
                <th>สถานะ</th>
                <th className="num">token เข้า</th>
                <th className="num">token ออก</th>
                <th className="num">บาท</th>
                <th className="num">เวลา (ms)</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    ไม่มีการเรียกโมเดล (ถูกบล็อกก่อนถึงผู้ให้บริการ)
                  </td>
                </tr>
              ) : (
                calls.map((call) => (
                  <tr key={call.id}>
                    <td className="num">{call.attempt}</td>
                    <td>{call.provider}</td>
                    <td className="mono tiny">{call.modelId}</td>
                    <td>
                      {call.status === "ok" ? (
                        <span className="badge badge--ok">ok</span>
                      ) : (
                        <span className="badge badge--danger">{call.errorCode ?? "error"}</span>
                      )}
                    </td>
                    <td className="num">{call.inputTokens}</td>
                    <td className="num">{call.outputTokens}</td>
                    <td className="num">{Number(call.costThb).toFixed(4)}</td>
                    <td className="num">{call.latencyMs ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="tiny faint" style={{ marginTop: "0.75rem" }}>
          สถานะคำขอ: {STATUS_LABELS[request.status] ?? request.status} · เวลารวม{" "}
          {request.latencyMs ?? "—"} ms · ข้อความที่ตรวจเพิ่มเติม:{" "}
          {spans
            .flatMap((span) =>
              Array.isArray(span.attributes?.notes) ? (span.attributes.notes as string[]) : [],
            )
            .join(", ") || "ไม่มี"}
        </p>
      </section>

      <div className="row">
        <Link className="button button--ghost" href="/admin/dashboard" prefetch={false}>
          กลับแดชบอร์ด
        </Link>
        <Link className="button button--quiet" href={`/`}>
          ไปหน้าถามคำถาม
        </Link>
      </div>
    </div>
  );
}
