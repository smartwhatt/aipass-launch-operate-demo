import Link from "next/link";
import type { Citation } from "@/lib/domain/types";
import { handbookLabel } from "@/lib/format";

/**
 * Citations.
 *
 * Each citation names the handbook edition and section in text, so the
 * reference is readable without relying on colour. The URL was built by the
 * server from a known section.
 */
export function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="citations">
      <div className="citations__title">แหล่งอ้างอิงจากคู่มือ</div>
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {citations.map((citation, index) => (
          <li className="citation" key={`${citation.documentId}-${citation.sectionId}`}>
            <span className="citation__index" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <div className="citation__label">
                {citation.sectionTitle}{" "}
                <span className="faint">
                  · {handbookLabel(citation.version)} ข้อ {citation.sectionId}
                </span>
              </div>
              <p className="citation__excerpt">“{citation.excerpt}”</p>
              <Link className="citation__link" href={citation.url} prefetch={false}>
                เปิดข้อนี้ในคู่มือ →
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
