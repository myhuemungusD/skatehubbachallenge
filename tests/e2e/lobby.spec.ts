import { test, expect } from "@playwright/test";

test.describe("Lobby smoke", () => {
  test("renders home experience", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Live S\.K\.8/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create lobby/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Join lobby/i })).toBeVisible();
  });
});
