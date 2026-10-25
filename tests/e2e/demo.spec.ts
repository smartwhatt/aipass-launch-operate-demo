import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ask, login, resetScenario } from "./helpers";

const SHOTS = path.join(process.cwd(), "artifacts", "screenshots");
mkdirSync(SHOTS, { recursive: true });

test.describe.configure({ mode: "serial" });

test("pilot asks a question and opens the citation", async ({ page }) => {
  await login(page, "pilot");
  await expect(page.getByRole("heading", { name: "ถามคู่มือ" })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "home-pilot.png"), fullPage: true });

  await ask(page, "ศูนย์เปิดกี่โมง");
  await expect(page.getByText("09:00–16:00").first()).toBeVisible();
  await expect(page.locator(".answer").getByText("ข้อมูลจำลอง")).toBeVisible();

  const citation = page.getByRole("link", { name: /เปิดข้อนี้ในคู่มือ/ });
  await expect(citation).toHaveAttribute("href", "/handbook/docs-v1#s2-1");
  await page.waitForTimeout(350); // let the answer fade-in finish before the evidence shot
  await page.screenshot({ path: path.join(SHOTS, "answer-with-citation.png"), fullPage: true });

  await citation.click();
  await expect(page).toHaveURL(/\/handbook\/docs-v1#s2-1/);
  await expect(page.getByText("ระบบกำลังตอบคำถามจากคู่มือฉบับนี้")).toBeVisible();
  await expect(page.locator("#s2-1")).toContainText("09:00–16:00");
});

test("pilot gets insufficient_info for an out-of-scope question", async ({ page }) => {
  await login(page, "pilot");
  await ask(page, "แนะนำสินเชื่อให้หน่อย");
  await expect(page.getByText("ข้อมูลไม่พอ").first()).toBeVisible();
  await expect(page.getByText(/ไม่ครอบคลุม/).first()).toBeVisible();
});

test("outsider is refused in the interface", async ({ page }) => {
  await login(page, "outsider");
  await expect(page.getByText(/บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานคู่มือบริการ/)).toBeVisible();
  await expect(page.getByRole("button", { name: "ส่งคำถาม" })).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, "outsider-blocked.png"), fullPage: true });
});

test("admin resets the stale-index scenario and sees the historical dashboard", async ({ page }) => {
  await login(page, "admin");
  await resetScenario(page, "ep3-stale-index");
  await page.screenshot({ path: path.join(SHOTS, "admin-demo.png"), fullPage: true });

  await page.goto("/admin/dashboard");
  await expect(page.getByText("28.84").first()).toBeVisible();
  await expect(page.getByText("9.0s").first()).toBeVisible();
  await expect(page.getByText("40").first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "dashboard.png"), fullPage: true });
});

test("the recorded trace DEMO-R042 keeps its old answer and versions", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/traces/DEMO-R042");
  await expect(page.getByText("09:00–16:00").first()).toBeVisible();
  await expect(page.getByText("docs-v1").first()).toBeVisible();
  await expect(page.getByText("index-v1").first()).toBeVisible();
  await expect(page.getByText("prompt-1").first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "trace-demo-r042.png"), fullPage: true });
});

test("admin runs the fixture evaluation against docs-v2 and passes the gate", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/evaluations");
  await page.getByLabel("ดัชนีเป้าหมาย").selectOption("docs-v2");
  await page.getByRole("button", { name: "รัน Q01–Q10" }).click();
  await expect(page.getByText("ผ่านเกณฑ์").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("10/10").first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "evaluations.png"), fullPage: true });
});

test("keyboard submission works and the answer is announced", async ({ page }) => {
  await login(page, "pilot");
  const box = page.getByLabel("คำถามของคุณ");
  await box.fill("ติดต่อเจ้าหน้าที่ได้ที่ไหน");
  await box.press("ControlOrMeta+Enter");
  await expect(page.getByText("ติดต่อเจ้าหน้าที่ผ่านปุ่ม", { exact: false }).first()).toBeVisible();
});

test("the calculator mirrors the workbook numbers", async ({ page }) => {
  await page.goto("/calculator");
  await expect(page.getByText("1,890.00").first()).toBeVisible();
  await expect(page.getByText("15,750.00").first()).toBeVisible();
  await expect(page.getByText("2,044.00").first()).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "calculator.png"), fullPage: true });
});
