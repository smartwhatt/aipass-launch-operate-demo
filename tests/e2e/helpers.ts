import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export type Credentials = { admin: string; pilot: string; outsider: string };

export function credentials(): Credentials {
  const file = path.join(process.cwd(), "artifacts", "e2e-accounts.json");
  return JSON.parse(readFileSync(file, "utf8")) as Credentials;
}

export async function login(page: Page, role: keyof Credentials): Promise<void> {
  const passwords = credentials();
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้").fill(role);
  await page.getByLabel("รหัสผ่าน").fill(passwords[role]);
  await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function ask(page: Page, question: string): Promise<void> {
  await page.getByLabel("คำถามของคุณ").fill(question);
  await page.getByRole("button", { name: "ส่งคำถาม" }).click();
}

export async function resetScenario(page: Page, scenario: string): Promise<void> {
  await page.goto("/admin/demo");
  const row = page.locator(".scenario", { hasText: scenario });
  await row.getByRole("button", { name: "ใช้สถานการณ์นี้" }).click();
  await row.getByRole("button", { name: "ยืนยันการรีเซ็ต" }).click();
  await page.waitForTimeout(1500);
}
