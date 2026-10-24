import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { getShell } from "@/lib/shell";
import { getCommitSha, environmentLabel } from "@/lib/config";

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
    <html lang="th">
      <body>
        <SiteHeader viewer={viewer} config={config} active={active} />
        <main>{children}</main>
        <footer className="site-footer">
          <div className="page stack stack-sm">
            <p>
              ถามคู่มือ — ศูนย์บริการตัวอย่าง · ข้อมูลและราคาทั้งหมดเป็นข้อมูลสมมติสำหรับการเรียน
              ไม่ใช่ข้อมูลของหน่วยงานจริง
            </p>
            <p className="mono tiny">
              {environmentLabel()} · v{config.APP_VERSION} · {config.DATA_NAMESPACE} · commit{" "}
              {getCommitSha().slice(0, 12)} · {config.AI_MODE}
            </p>
            <p className="tiny">
              <Link href="/handbook/docs-v1" prefetch={false}>
                คู่มือ
              </Link>
              {" · "}
              <Link href="/calculator">คำนวณต้นทุน</Link>
              {" · "}
              <Link href="/api/health">สถานะระบบ</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
