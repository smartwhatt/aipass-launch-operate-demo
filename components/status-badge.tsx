import { STATUS_LABELS, statusTone } from "@/lib/format";

const TONE_CLASS: Record<string, string> = {
  ok: "badge badge--ok",
  warn: "badge badge--warn",
  danger: "badge badge--danger",
  neutral: "badge",
};

const TONE_SYMBOL: Record<string, string> = {
  ok: "●",
  warn: "▲",
  danger: "■",
  neutral: "○",
};

/**
 * Status is never colour-only: it carries a symbol and the Thai status word.
 */
export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span className={TONE_CLASS[tone]}>
      <span className="status-symbol" aria-hidden="true">
        {TONE_SYMBOL[tone]}
      </span>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
