import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import type { AppRole } from "@/lib/domain/types";
import { getViewer, type Viewer } from "@/lib/auth/session";

/**
 * Server-side authorization.
 *
 * Every handler calls one of these helpers. Hidden buttons are not a control:
 * the functional tests call the routes directly with an outsider session.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly nextAction?: string;

  constructor(status: number, code: string, message: string, nextAction?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.nextAction = nextAction;
  }
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "ผู้ดูแลระบบ",
  pilot: "ผู้ใช้ทดลองนำร่อง",
  outsider: "ผู้ใช้ภายนอก",
};

export function canAsk(viewer: Viewer | null): boolean {
  return viewer?.role === "admin" || viewer?.role === "pilot";
}

export function canReadHandbook(viewer: Viewer | null): boolean {
  return canAsk(viewer);
}

export function isAdmin(viewer: Viewer | null): boolean {
  return viewer?.role === "admin";
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    throw new HttpError(401, "unauthorized", "ต้องเข้าสู่ระบบก่อนใช้ส่วนนี้", "เข้าสู่ระบบด้วยบัญชีที่ได้รับ");
  }
  return viewer;
}

export async function requireRole(...roles: AppRole[]): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!roles.includes(viewer.role)) {
    throw new HttpError(
      403,
      "forbidden",
      "บัญชีนี้ไม่มีสิทธิ์ใช้ส่วนนี้",
      "ใช้บัญชีผู้ดูแลระบบสำหรับหน้าจอควบคุมการสาธิต",
    );
  }
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  return requireRole("admin");
}

/** Demo controls exist only in a dedicated course sandbox. */
export function demoControlsEnabled(): boolean {
  return getConfig().DEMO_CONTROLS_ENABLED;
}

export async function requireDemoControls(): Promise<Viewer> {
  const viewer = await requireAdmin();
  if (!demoControlsEnabled()) {
    throw new HttpError(
      403,
      "demo_controls_disabled",
      "การควบคุมการสาธิตปิดอยู่ในชุดติดตั้งนี้",
      "ตั้งค่า DEMO_CONTROLS_ENABLED=true เฉพาะในแซนด์บ็อกซ์สำหรับการสอน",
    );
  }
  return viewer;
}

/** Route-handler variant of requireRole. */
export async function requireAdminFromRequest(
  request: import("next/server").NextRequest,
): Promise<Viewer> {
  const { getViewerFromRequest } = await import("@/lib/auth/session");
  const viewer = await getViewerFromRequest(request);
  if (!viewer) {
    throw new HttpError(401, "unauthorized", "ต้องเข้าสู่ระบบก่อนใช้ส่วนนี้", "เข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ");
  }
  if (viewer.role !== "admin") {
    throw new HttpError(403, "forbidden", "เฉพาะผู้ดูแลระบบเท่านั้น", "ใช้บัญชี admin สำหรับหน้าจอควบคุม");
  }
  return viewer;
}

/** Page guard: redirects instead of throwing, so admins see a login screen. */
export async function requireAdminPage(nextPath = "/admin/demo"): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (viewer.role !== "admin") redirect("/");
  return viewer;
}

/** Route-handler variant: admin from the request cookie, plus demo controls. */
export async function requireDemoControlsFromRequest(
  request: import("next/server").NextRequest,
): Promise<Viewer> {
  const viewer = await requireAdminFromRequest(request);
  if (!demoControlsEnabled()) {
    throw new HttpError(
      403,
      "demo_controls_disabled",
      "การควบคุมการสาธิตปิดอยู่ในชุดติดตั้งนี้",
      "ตั้งค่า DEMO_CONTROLS_ENABLED=true เฉพาะในแซนด์บ็อกซ์สำหรับการสอน",
    );
  }
  return viewer;
}
