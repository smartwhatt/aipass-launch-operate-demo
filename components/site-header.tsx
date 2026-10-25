import Link from "next/link";
import type { Viewer } from "@/lib/auth/session";
import type { AppConfig } from "@/lib/config";
import type { ActiveContext } from "@/lib/state/active";
import { LogoutButton } from "@/components/logout-button";

/**
 * Site header.
 *
 * Learner-facing: the service name, the tasks, and the account. The
 * environment tag appears only outside Local, and the technical status line
 * lives in the footer and on /about.
 */
export function SiteHeader({
  viewer,
  config,
  active,
}: {
  viewer: Viewer | null;
  config: AppConfig;
  active: ActiveContext | null;
}) {
  const envLabel =
    config.APP_ENV === "preview"
      ? "Preview"
      : config.APP_ENV === "production"
        ? "Production"
        : null;
  const handbookHref = `/handbook/${active?.index?.docKey ?? config.DOCS_VERSION}`;
  const isAdmin = viewer?.role === "admin";

  return (
    <header className="site-header">
      <div className="page">
        <div className="site-header__top">
          <div className="brand-row">
            <Link href="/" className="brand" aria-label="ถามคู่มือ — ศูนย์บริการตัวอย่าง">
              <span className="brand__mark">ถามคู่มือ</span>
              <span className="brand__sub">ศูนย์บริการตัวอย่าง</span>
            </Link>
            {envLabel ? <span className="env-tag">{envLabel}</span> : null}
            <span className="badge header-fictional">ข้อมูลสมมติสำหรับการเรียน</span>
          </div>

          <nav className="header-nav" aria-label="เมนูหลัก">
            <Link href="/">ถามคำตอบ</Link>
            <Link href={handbookHref} prefetch={false}>
              คู่มือบริการ
            </Link>
            <Link href="/about">เกี่ยวกับ</Link>
            {isAdmin ? <Link href="/admin/demo">สำหรับผู้สอน</Link> : null}
            {viewer ? (
              <>
                <span className="faint small viewer-name">{viewer.displayName}</span>
                <LogoutButton />
              </>
            ) : (
              <Link href="/login">เข้าสู่ระบบ</Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
