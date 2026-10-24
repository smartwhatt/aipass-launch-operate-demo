import Link from "next/link";
import { redirect } from "next/navigation";
import { getShell } from "@/lib/shell";
import { AdminTabs } from "@/components/admin/tabs";
import { environmentLabel } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { viewer, config, active } = await getShell();

  if (!viewer) redirect("/login?next=/admin/demo");
  if (viewer.role !== "admin") {
    return (
      <div className="page">
        <div className="login-shell">
          <div className="login-card stack">
            <h1 style={{ fontSize: "1.4rem" }}>ต้องเป็นผู้ดูแลระบบ</h1>
            <p className="small muted">
              หน้านี้แสดงร่องรอยคำขอ สถานการณ์สาธิต และการรีเซ็ตข้อมูล เฉพาะบัญชี admin เท่านั้น
            </p>
            <Link className="button" href="/">
              กลับไปหน้าคำถาม
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="admin-head">
        <div className="row-between">
          <div>
            <h1>หน้าควบคุมการสาธิต</h1>
            <p className="small muted">
              {environmentLabel()} · namespace <span className="mono">{config.DATA_NAMESPACE}</span> ·
              แอป v{config.APP_VERSION} · {active?.index?.indexKey ?? "ไม่มีดัชนี"}
            </p>
          </div>
          {config.DEMO_CONTROLS_ENABLED ? (
            <span className="badge badge--ink">แซนด์บ็อกซ์สำหรับการสอน</span>
          ) : (
            <span className="badge badge--warn">ปิดการควบคุมการสาธิต</span>
          )}
        </div>
        <AdminTabs />
      </div>
      {children}
    </div>
  );
}
