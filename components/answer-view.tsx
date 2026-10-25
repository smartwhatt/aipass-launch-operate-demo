import Link from "next/link";
import type { QuestionResponse } from "@/lib/domain/types";
import { formatThaiDateTime, handbookLabel, STATUS_LABELS, statusTone } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { CitationList } from "@/components/citation-list";
import { FeedbackButtons } from "@/components/feedback-buttons";
import { ContactPanel } from "@/components/contact-panel";

const BLOCKED = new Set([
  "rate_limited",
  "quota_exceeded",
  "budget_exceeded",
  "provider_unavailable",
  "unauthorized",
]);

/**
 * One answer, rendered the same way on the home screen and in admin views.
 *
 * A wrong answer can still be a successful HTTP response: the status badge and
 * the answer text are separate pieces of information.
 *
 * Learner-facing wording: the source reads as an edition ("คู่มือฉบับที่ 1"),
 * not as an internal key. The key stays in the API payload and the trace.
 */
export function AnswerView({
  response,
  handbookHref,
  canGiveFeedback,
  showTraceLink,
  answerHref,
}: {
  response: QuestionResponse;
  handbookHref: string;
  canGiveFeedback: boolean;
  showTraceLink: boolean;
  answerHref?: string | null;
}) {
  const blocked = BLOCKED.has(response.status);
  const tone = statusTone(response.status);
  const noticeClass =
    tone === "danger" ? "notice notice--danger" : tone === "warn" ? "notice notice--warn" : "notice";
  // A citation wins. Otherwise the server's checked-handbook link wins over the
  // page's default, which may be the stale active version during an incident.
  const primaryHref = response.citations[0]?.url ?? response.fallback_url ?? handbookHref;
  const primaryLabel = response.citations[0]
    ? "ดูข้อความในคู่มือ"
    : response.fallback_url
      ? "เปิดคู่มือที่ตรวจสอบแล้ว"
      : "เปิดคู่มือ";
  const retryAt = response.retry_at ? formatThaiDateTime(response.retry_at) : null;
  const source = response.versions.handbook
    ? `ตอบจาก${handbookLabel(response.versions.handbook)}`
    : null;

  return (
    <section className="answer" aria-live="polite" aria-label="คำตอบจากคู่มือ">
      <div className="answer__head">
        <StatusBadge status={response.status} />
        <span className="answer__label">
          {response.mode === "fixture" ? "ข้อมูลจำลอง" : "ข้อมูลจริง"}
          {source ? ` · ${source}` : ""}
        </span>
      </div>

      {blocked ? (
        <div className={noticeClass}>
          <div className="notice__title">{STATUS_LABELS[response.status] ?? response.status}</div>
          <p className="small">{response.explanation || response.answer}</p>
          {response.next_action ? (
            <p className="small muted" style={{ marginTop: "0.4rem" }}>
              ขั้นต่อไป: {response.next_action}
            </p>
          ) : null}
          {retryAt ? (
            <p className="small" style={{ marginTop: "0.4rem" }}>
              เริ่มใหม่ได้เมื่อ <strong>{retryAt}</strong> (เวลาไทย)
            </p>
          ) : null}
        </div>
      ) : (
        <p className="answer__text">{response.answer}</p>
      )}

      {!blocked && response.status === "insufficient_info" ? (
        <div className="notice notice--warn" style={{ marginTop: "1.25rem" }}>
          <p className="small">
            {response.explanation || "คู่มือมีข้อมูลไม่พอสำหรับตอบคำถามนี้"}
            {response.next_action ? ` — ${response.next_action}` : ""}
          </p>
        </div>
      ) : null}

      <CitationList citations={response.citations} />

      {response.request_id ? (
        <div className="answer__meta">
          <span>
            เลขที่คำขอ <span className="mono">{response.request_id}</span>
          </span>
        </div>
      ) : null}

      <div className="answer__actions">
        <Link className="button button--ghost" href={primaryHref} prefetch={false}>
          {primaryLabel}
        </Link>
        <ContactPanel />
        {showTraceLink && response.request_id && answerHref ? (
          <Link className="button button--quiet" href={answerHref}>
            ดูร่องรอย (trace)
          </Link>
        ) : null}
      </div>

      {canGiveFeedback && response.request_id ? (
        <div style={{ marginTop: "1rem" }}>
          <FeedbackButtons requestId={response.request_id} />
        </div>
      ) : null}
    </section>
  );
}
