import { expect, test } from "@playwright/test";

test("landing page keeps primary CTA text readable", async ({ page }) => {
  await page.goto("/");

  for (const button of [
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Start free', exact: true }),
    page.getByRole('link', { name: 'Start tracking free', exact: true }),
  ]) {
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS("color", "rgb(18, 19, 22)");
    await expect(button).toHaveCSS("background-color", "rgb(242, 241, 238)");
  }
});
