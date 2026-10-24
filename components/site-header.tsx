import Link from "next/link";
import type { Viewer } from "@/lib/auth/session";
import type { AppConfig } from "@/lib/config";
import type { ActiveContext } from "@/lib/state/active";
import { LogoutButton } from "@/components/logout-button";

/**
 * Site header.
 *
 * Two rows: the teaching identity, then the environment strip that the lesson
 * refers to (Local / Preview / Production, app version, handbook and index,
 * fixture or live mode).
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
    config.APP_ENV === "preview" ? "Preview" : config.APP_ENV === "production" ? "Production" : "Local";
  const handbook = active?.index?.docKey ?? config.DOCS_VERSION;
  const index = active?.index?.indexKey ?? config.INDEX_VERSION;
  const isAdmin = viewer?.role === "admin";

  return (
    <header className="site-header">
      <div className="page">
        <div className="site-header__top">
          <Link href="/" className="brand" aria-label="ถามคู่มือ — ศูนย์บริการตัวอย่าง">
            <span className="brand__mark">ถามคู่มือ</span>
            <span className="brand__sub">ศูนย์บริการตัวอย่าง</span>
          </Link>

          <nav className="header-nav" aria-label="เมนูหลัก">
            <Link href="/handbook/docs-v1" prefetch={false}>
              คู่มือ
            </Link>
            <Link href="/calculator">คำนวณต้นทุน</Link>
            {isAdmin ? <Link href="/admin/demo">หน้าควบคุม</Link> : null}
            {viewer ? (
              <>
                <span className="faint small viewer-name">
                  {viewer.displayName}
                </span>
                <LogoutButton />
              </>
            ) : (
              <Link href="/login">เข้าสู่ระบบ</Link>
            )}
          </nav>
        </div>

        <div className="env-strip" aria-label="สภาพแวดล้อมของระบบ">
          <span>{envLabel}</span>
          <span className="env-strip__sep">/</span>
          <span>v{config.APP_VERSION}</span>
          <span className="env-strip__sep">/</span>
          <span>
            {handbook} · {index}
          </span>
          <span className="env-strip__sep">/</span>
          <span>{config.AI_MODE === "fixture" ? "Fixture mode" : "Live mode"}</span>
          <span className="badge" style={{ marginLeft: "auto" }}>
            ข้อมูลสมมติสำหรับการเรียน
          </span>
        </div>

        {config.APP_ENV === "preview" ? (
          <p className="preview-ribbon">
            Preview build · ยังไม่ใช่ Production · ตรวจคำถาม รุ่นคู่มือ และสิทธิ์ก่อน promote
          </p>
        ) : null}
      </div>
    </header>
  );
}
