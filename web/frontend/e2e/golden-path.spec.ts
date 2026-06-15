import { test, expect } from '@playwright/test'

// Golden path E2E : parcours utilisateur complet. Pas de backend lance — on
// stub /api/** + on injecte le token dans localStorage.

const setupAuth = (role: 'USER' | 'ADMIN' = 'USER') => async (page: import('@playwright/test').Page): Promise<void> => {
  await page.addInitScript((r) => {
    window.localStorage.setItem(
      'roblaude-auth',
      JSON.stringify({
        state: { token: 'gp-token', user: { id: 1, email: 'gp@x', name: 'GP', role: r } },
        version: 0,
      }),
    )
  }, role)
}

const stubApi = async (page: import('@playwright/test').Page): Promise<void> => {
  // catch-all en premier = priorité la plus basse (Playwright évalue la route
  // enregistrée en dernier en premier)
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, body: '[]' }))
  await page.route('**/api/health', (route) => route.fulfill({ status: 200, body: '{"status":"ok"}' }))
  await page.route('**/api/mapping/sessions**', (route) => route.fulfill({ status: 200, body: '[]' }))
  await page.route('**/api/admin/ssh/**', (route) => route.fulfill({ status: 200, body: '[]' }))
  // le dashboard attend {data, total} pour les missions et {data} pour le statut robot,
  // sinon missions.filter() plante et démonte la page
  await page.route('**/api/missions**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) }),
  )
  await page.route('**/api/robots/1/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { id: 1, name: 'Transbot-01', status: 'AVAILABLE', battery: 80, positionX: 0, positionY: 0, heading: 0 },
      }),
    }),
  )
}

test.describe('Golden path utilisateur', () => {
  test('Dashboard accessible apres login', async ({ page }) => {
    await setupAuth('USER')(page)
    await stubApi(page)
    await page.goto('/')
    // robot info ou link mapping visible
    await expect(page.getByRole('link', { name: /Mode mapping|Cartographier/i }).first()).toBeVisible()
  })

  test('Page mapping shell complete', async ({ page }) => {
    await setupAuth('USER')(page)
    await stubApi(page)
    await page.goto('/mapping')
    await expect(page.getByRole('heading', { name: 'Mode mapping' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Demarrer/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Arreter/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sauvegarder/ })).toBeVisible()
    // Téléop visible
    await expect(page.getByText('Téléop')).toBeVisible()
    // DockBottom
    await expect(page.getByText('TF tree')).toBeVisible()
    await expect(page.getByText('Topics')).toBeVisible()
  })

  test('Toggle thème arcade applique class sur body', async ({ page }, testInfo) => {
    // le toggle arcade vit dans la sidebar desktop (hidden lg:flex) — absent en mobile
    test.skip(testInfo.project.name === 'mobile', 'Toggle arcade = contrôle sidebar desktop')
    await setupAuth('USER')(page)
    await stubApi(page)
    await page.goto('/')
    const arcadeBtn = page.getByRole('button', { name: /Mode arcade|Arcade ON/ })
    await arcadeBtn.click()
    await expect(page.locator('body')).toHaveClass(/theme-arcade/)
  })

  test('Admin SSH bloque pour USER', async ({ page }) => {
    await setupAuth('USER')(page)
    await stubApi(page)
    await page.goto('/admin/ssh')
    await expect(page).toHaveURL(/\/$/)
  })

  test('Admin SSH accessible pour ADMIN avec sections', async ({ page }) => {
    await setupAuth('ADMIN')(page)
    await stubApi(page)
    await page.goto('/admin/ssh')
    await expect(page.getByRole('heading', { name: 'SSH admin' })).toBeVisible()
    await expect(page.getByText(/Terminal SSH|Console|journalctl|Historique audit/).first()).toBeVisible()
  })
})
