import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { getShell } from "@/lib/shell";
import { environmentLabel } from "@/lib/config";
import { handbookLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ถามคู่มือ — ศูนย์บริการตัวอย่าง",
  description:
    "แอปถามตอบคู่มือสำหรับการสอน: ตอบจากคู่มือพร้อมแหล่งอ้างอิง ข้อมูลสมมติสำหรับการเรียน",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { viewer, config, active } = await getShell();

  return (
    // Browser extensions inject attributes before React hydrates (caret-color,
    // cz-shortcut-listen, and others). Suppress the resulting warnings on the
    // two root elements; the app's own markup stays strict.
    <html lang="th" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SiteHeader viewer={viewer} config={config} active={active} />
        <main>{children}</main>
        <footer className="site-footer">
          <div className="page">
            <div className="footer-top">
              <div>
                <p className="footer-brand">ถามคู่มือ · ศูนย์บริการตัวอย่าง</p>
                <p className="tiny muted">
                  บริการตัวอย่างสำหรับการเรียน ข้อมูล คำตอบ และราคาเป็นข้อมูลสมมติ
                  ไม่ใช่ของหน่วยงานจริง
                </p>
              </div>
              <nav className="footer-nav" aria-label="เมนูส่วนท้าย">
                <Link href="/">ถามคำตอบ</Link>
                <Link href="/handbook/docs-v1" prefetch={false}>
                  คู่มือบริการ
                </Link>
                <Link href="/calculator">เครื่องคำนวณต้นทุน</Link>
                <Link href="/about">เกี่ยวกับบริการ</Link>
                {viewer?.role === "admin" ? (
                  <Link href="/admin/demo">สำหรับผู้สอน</Link>
                ) : null}
              </nav>
            </div>
            <p className="status-line">
              {environmentLabel()} · v{config.APP_VERSION} ·{" "}
              {handbookLabel(active?.index?.docKey ?? config.DOCS_VERSION)} ·{" "}
              {config.AI_MODE === "fixture" ? "ข้อมูลจำลอง" : "ข้อมูลจริง"}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
