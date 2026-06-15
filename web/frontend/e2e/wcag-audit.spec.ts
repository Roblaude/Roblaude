import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Audit WCAG AA (#149) — passe axe sur les pages clés authentifiées.
// API stubbée + token injecté (pas de backend lancé par Playwright).

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

const setAuth = (page: Page, role: 'USER' | 'ADMIN') =>
  page.addInitScript((r) => {
    window.localStorage.setItem(
      'roblaude-auth',
      JSON.stringify({ state: { token: 'a11y', user: { id: 1, email: 'a@x', name: 'A', role: r } }, version: 0 }),
    )
  }, role)

async function stub(page: Page) {
  await page.route('**/api/**', (r) => r.fulfill(json({ data: [], total: 0 })))
  await page.route('**/api/missions**', (r) => r.fulfill(json({ data: [], total: 0 })))
  await page.route('**/api/robots/1/status', (r) =>
    r.fulfill(json({ data: { id: 1, name: 'R', status: 'AVAILABLE', battery: 80, positionX: 0, positionY: 0, heading: 0 } })),
  )
  await page.route('**/api/robots', (r) => r.fulfill(json({ data: [{ id: 1, name: 'R', status: 'AVAILABLE' }] })))
  await page.route('**/api/points', (r) => r.fulfill(json({ data: [] })))
  await page.route('**/api/objects', (r) => r.fulfill(json({ data: [] })))
}

const PAGES: { path: string; role: 'USER' | 'ADMIN'; name: string }[] = [
  { path: '/login', role: 'USER', name: 'Login' },
  { path: '/', role: 'USER', name: 'Dashboard' },
  { path: '/missions', role: 'USER', name: 'Missions' },
  { path: '/missions/new', role: 'USER', name: 'Nouvelle mission' },
  { path: '/admin/objects', role: 'ADMIN', name: 'Admin objets' },
  { path: '/profile', role: 'USER', name: 'Profil' },
]

test.describe('Audit WCAG AA (#149)', () => {
  for (const p of PAGES) {
    test(`${p.name} — aucune violation WCAG AA`, async ({ page }) => {
      if (p.path !== '/login') await setAuth(page, p.role)
      await stub(page)
      await page.goto(p.path)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(results.violations).toEqual([])
    })
  }
})
