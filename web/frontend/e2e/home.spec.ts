import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe("Page d'accueil", () => {
  test('charge correctement', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/RobLaude|Vite/);
  });

  test('aucune violation WCAG AA critique', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
