import { expect, test } from "@playwright/test";

/**
 * UI smoke only — the real Normal vs Thrift A/B lives in scripts/ab-agent.mjs.
 * Requires: pnpm dev on :5175
 */
test.describe("Cadan UI smoke", () => {
  test("landing shows Cadan brand and workspace console", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "CadanADE" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/workspace · console|Open workspace|Initialize project/i).first()).toBeVisible();
  });

  test("settings opens provider routing controls", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByText("Settings Console")).toBeVisible();
    await expect(page.getByText("Agent routing")).toBeVisible();
    await expect(page.getByRole("button", { name: "Normal" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thrift" })).toBeVisible();
  });
});
