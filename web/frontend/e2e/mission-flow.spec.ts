import { test, expect, type Page } from '@playwright/test'

// E2E UC-01 (transport) : création de mission + arrêt d'urgence.
// Pas de backend lancé — on stub /api/** et on injecte un token dans localStorage.

const setupAuth = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'roblaude-auth',
      JSON.stringify({
        state: { token: 'uc01-token', user: { id: 1, email: 'op@x', name: 'Op', role: 'USER' } },
        version: 0,
      }),
    )
  })
}

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

const ACCUEIL = { id: 1, name: 'Accueil', slug: 'accueil' }
const BUREAU = { id: 2, name: 'Bureau 204', slug: 'bureau-204' }

test.describe('UC-01 — flux mission transport', () => {
  test('création mission → page détail', async ({ page }) => {
    const mission = {
      id: 42,
      type: 'TRANSPORT',
      status: 'PENDING',
      userId: 1,
      robotId: null,
      fromPointId: 1,
      toPointId: 2,
      objectId: null,
      failureReason: null,
      graspAttempts: 0,
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
      fromPoint: ACCUEIL,
      toPoint: BUREAU,
      robot: null,
    }

    await setupAuth(page)
    // catch-all d'abord (priorité la plus basse), puis les routes spécifiques
    await page.route('**/api/**', (r) => r.fulfill(json({ data: [], total: 0 })))
    await page.route('**/api/points', (r) => r.fulfill(json({ data: [ACCUEIL, BUREAU] })))
    await page.route('**/api/robots', (r) => r.fulfill(json({ data: [{ id: 1, name: 'Transbot-01', status: 'AVAILABLE' }] })))
    await page.route('**/api/missions**', (route) => {
      const req = route.request()
      const pathname = new URL(req.url()).pathname
      if (req.method() === 'POST' && pathname.endsWith('/missions')) {
        return route.fulfill({ ...json({ data: mission }), status: 201 })
      }
      if (pathname.endsWith('/missions/42')) {
        return route.fulfill(json({ data: mission }))
      }
      return route.fulfill(json({ data: [], total: 0 }))
    })

    await page.goto('/missions/new')

    const fromSelect = page.getByLabel('Point de depart')
    await expect(fromSelect).toBeEnabled()
    await fromSelect.selectOption('1')
    await page.getByLabel('Point d arrivee').selectOption('2')

    await page.getByRole('button', { name: 'Creer la mission' }).click()

    await expect(page).toHaveURL(/\/missions\/42$/)
    await expect(page.getByRole('heading', { name: 'Mission #42' })).toBeVisible()
    await expect(page.getByText('Transport de document')).toBeVisible()
  })

  test('STOP — arrête la mission active', async ({ page }, testInfo) => {
    // bouton STOP global = sidebar desktop (hidden lg:flex)
    test.skip(testInfo.project.name === 'mobile', 'STOP global = contrôle sidebar desktop')

    const mission = {
      id: 7,
      type: 'TRANSPORT',
      status: 'NAVIGATING_TO_PICKUP',
      userId: 1,
      robotId: 1,
      fromPointId: 1,
      toPointId: 2,
      objectId: null,
      failureReason: null,
      graspAttempts: 0,
      createdAt: '2026-06-14T09:00:00.000Z',
      updatedAt: '2026-06-14T09:30:00.000Z',
      fromPoint: ACCUEIL,
      toPoint: BUREAU,
      robot: { id: 1, name: 'Transbot-01', status: 'BUSY' },
    }

    let stopCalled = false

    await setupAuth(page)
    await page.route('**/api/**', (r) => r.fulfill(json({ data: [], total: 0 })))
    await page.route('**/api/missions**', (r) => r.fulfill(json({ data: [mission], total: 1 })))
    await page.route('**/api/robots/1/status', (r) =>
      r.fulfill(json({ data: { id: 1, name: 'Transbot-01', status: 'AVAILABLE', battery: 80, positionX: 0, positionY: 0, heading: 0 } })),
    )
    await page.route('**/api/missions/7/stop', (route) => {
      stopCalled = true
      return route.fulfill(json({ data: { ...mission, status: 'CANCELLED' } }))
    })

    // le bouton STOP demande confirmation via window.confirm
    page.on('dialog', (d) => d.accept())

    await page.goto('/')
    // attend que les missions soient chargées (sinon STOP dit "aucune mission active")
    await expect(page.getByRole('link', { name: '#007 · Transport' })).toBeVisible()

    const stopBtn = page.getByRole('button', { name: "Arrêt d'urgence du robot" })
    await expect(stopBtn).toBeEnabled()
    await stopBtn.click()

    await expect(page.getByText('Mission #7 stoppée')).toBeVisible()
    expect(stopCalled).toBe(true)
  })
})
