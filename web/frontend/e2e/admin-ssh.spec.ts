import { test, expect } from '@playwright/test'

// E2E smoke /admin/ssh. Pas de backend lance par Playwright = on stub les
// reponses et on injecte un token ADMIN dans localStorage.

test.describe('Page Admin SSH', () => {
  test('non-admin redirige vers /', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'roblaude-auth',
        JSON.stringify({
          state: { token: 'fake', user: { id: 1, email: 'u@x', name: 'U', role: 'USER' } },
          version: 0,
        }),
      )
    })
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, body: '[]' }))
    await page.goto('/admin/ssh')
    await expect(page).toHaveURL(/\/$/)
  })

  test('admin voit la page avec console + journalctl + audit', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'roblaude-auth',
        JSON.stringify({
          state: { token: 'fake', user: { id: 1, email: 'a@x', name: 'A', role: 'ADMIN' } },
          version: 0,
        }),
      )
    })
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, body: '[]' }))
    await page.goto('/admin/ssh')

    await expect(page.getByRole('heading', { name: 'SSH admin' })).toBeVisible()
    await expect(page.getByText('Console (commandes allowlist)')).toBeVisible()
    await expect(page.getByText('journalctl')).toBeVisible()
    await expect(page.getByText('Historique audit SSH')).toBeVisible()
  })
})
