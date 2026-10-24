"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { QuestionResponse } from "@/lib/domain/types";
import { AnswerView } from "@/components/answer-view";

const EXAMPLES = [
  "ศูนย์เปิดกี่โมง",
  "ขอใช้ห้องประชุมต้องเตรียมอะไร",
  "ติดต่อเจ้าหน้าที่ได้ที่ไหน",
  "แนะนำสินเชื่อให้หน่อย",
];

const MAX_LENGTH = 2000;

type SubmitState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "result"; response: QuestionResponse }
  | { kind: "error"; message: string; nextAction?: string; status: string };

/**
 * Question input.
 *
 * One submission = one idempotency key. The button is disabled while a request
 * is in flight, so a double click cannot create a second model call. The layout
 * is tested at 360 px.
 */
export function QuestionForm({
  canAsk,
  disabledReason,
  handbookHref,
  isAdmin,
}: {
  canAsk: boolean;
  disabledReason: string | null;
  handbookHref: string;
  isAdmin: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [validation, setValidation] = useState<string | null>(null);
  const pendingKey = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const length = Array.from(question.trim()).length;
  const loading = state.kind === "loading";

  async function submit() {
    if (loading || !canAsk) return;
    const trimmed = question.trim();
    const codePoints = Array.from(trimmed).length;

    if (codePoints === 0) {
      setValidation("พิมพ์คำถามก่อนส่ง");
      textareaRef.current?.focus();
      return;
    }
    if (codePoints > MAX_LENGTH) {
      setValidation(`คำถามยาว ${codePoints} ตัวอักษร เกิน ${MAX_LENGTH} ตัวอักษร`);
      return;
    }

    setValidation(null);
    setState({ kind: "loading" });
    // Reuse the key for a retry of the same submission: the server dedupes it.
    pendingKey.current ??= crypto.randomUUID();

    try {
      const response = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, idempotency_key: pendingKey.current }),
      });

      const payload = (await response.json()) as
        | QuestionResponse
        | { status: string; error?: { code?: string; message?: string; next_action?: string } };

      if (!response.ok) {
        const errorPayload = payload as {
          status: string;
          error?: { message?: string; next_action?: string };
        };
        setState({
          kind: "error",
          status: errorPayload.status ?? "error",
          message: errorPayload.error?.message ?? "ส่งคำถามไม่สำเร็จ",
          nextAction: errorPayload.error?.next_action,
        });
        return;
      }

      pendingKey.current = null;
      setState({ kind: "result", response: payload as QuestionResponse });
    } catch {
      setState({
        kind: "error",
        status: "network_error",
        message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ในขณะนี้",
        nextAction: "ตรวจการเชื่อมต่อแล้วกดส่งซ้ำ ระบบจะไม่สร้างคำขอซ้ำ",
      });
    }
  }

  if (!canAsk) {
    return (
      <div className="ask">
        <div className="notice">
          <div className="notice__title">ยังถามคำถามไม่ได้</div>
          <p className="small muted">{disabledReason}</p>
          <div className="row" style={{ marginTop: "0.9rem" }}>
            <Link className="button" href="/login">
              เข้าสู่ระบบ
            </Link>
            <Link className="button button--ghost" href={handbookHref} prefetch={false}>
              เปิดคู่มือ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <form
        className="ask"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
      >
        <label className="field">
          <span className="field__label">คำถามของคุณ</span>
          <textarea
            ref={textareaRef}
            className="textarea"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onInput={(event) => {
              const next = event.currentTarget.value;
              if (Array.from(next.trim()).length <= MAX_LENGTH) setValidation(null);
            }}
            placeholder="พิมพ์คำถามเกี่ยวกับศูนย์บริการตัวอย่าง เช่น ศูนย์เปิดกี่โมง"
            aria-invalid={validation ? true : undefined}
            aria-describedby="question-hint"
            maxLength={4000}
            disabled={loading}
            autoFocus
          />
        </label>

        <div className="ask__footer">
          <div className="field__hint" id="question-hint">
            <span>
              {length}/{MAX_LENGTH} ตัวอักษร · ไม่ต้องใส่ข้อมูลส่วนตัว
            </span>
            <span className="faint tiny">Ctrl/⌘ + Enter เพื่อส่ง</span>
          </div>
          <button className="button" type="submit" disabled={loading}>
            {loading ? "กำลังค้นคู่มือ…" : "ส่งคำถาม"}
          </button>
        </div>

        {validation ? <p className="form-error" style={{ marginTop: "0.6rem" }}>{validation}</p> : null}

        <div className="examples" style={{ marginTop: "0.9rem" }}>
          <span className="tiny faint" style={{ alignSelf: "center" }}>
            ตัวอย่าง
          </span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="example-chip"
              disabled={loading}
              onClick={() => {
                setQuestion(example);
                textareaRef.current?.focus();
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </form>

      <div aria-live="polite" aria-atomic="false">
        {loading ? (
          <p className="loading" style={{ marginTop: "1.5rem" }}>
            <span className="loading__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            กำลังค้นคู่มือและตรวจหลักฐาน…
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div className="notice notice--danger" style={{ marginTop: "1.5rem" }}>
            <div className="notice__title">ส่งคำถามไม่สำเร็จ</div>
            <p className="small">{state.message}</p>
            {state.nextAction ? <p className="small muted">{state.nextAction}</p> : null}
          </div>
        ) : null}

        {state.kind === "result" ? (
          <AnswerView
            response={state.response}
            handbookHref={handbookHref}
            canGiveFeedback
            showTraceLink={isAdmin}
            answerHref={
              state.response.request_id
                ? `/admin/traces/${encodeURIComponent(state.response.request_id)}`
                : null
            }
          />
        ) : null}
      </div>
    </div>
  );
}
