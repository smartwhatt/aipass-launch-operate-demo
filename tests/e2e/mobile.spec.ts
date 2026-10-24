import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ask, login } from "./helpers";

const SHOTS = path.join(process.cwd(), "artifacts", "screenshots");
mkdirSync(SHOTS, { recursive: true });

/**
 * Narrow-screen checks at 360 px, the width the course asks learners to test.
 * The page must not scroll sideways and the form must stay usable.
 */
test("home fits 360 px without horizontal overflow", async ({ page }) => {
  await login(page, "pilot");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await expect(page.getByRole("button", { name: "ส่งคำถาม" })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "mobile-home-360.png"), fullPage: true });

  await ask(page, "ศูนย์เปิดกี่โมง");
  await expect(page.getByText("09:00–16:00").first()).toBeVisible();
  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowAfter).toBeLessThanOrEqual(1);
  await page.screenshot({ path: path.join(SHOTS, "mobile-answer-360.png"), fullPage: true });
});
