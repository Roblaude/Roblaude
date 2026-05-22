import { test, expect } from '@playwright/test'

// Smoke E2E /mapping. Le backend n'est pas lance par playwright (webServer
// ne fait que `npm run dev` frontend), donc on teste uniquement les
// comportements client-side : redirection auth + chargement post-stub.

test.describe('Page Mapping', () => {
  test('redirige vers /login sans token', async ({ page }) => {
    await page.goto('/mapping')
    await expect(page).toHaveURL(/\/login/)
  })

  test('charge la page apres injection token (smoke shell)', async ({ page }) => {
    // injecte un token bidon dans zustand pour passer RequireAuth.
    // Le WS et les calls API echoueront mais le shell doit s'afficher.
    await page.addInitScript(() => {
      // authStore est persiste via zustand/persist en cle 'roblaude-auth'
      window.localStorage.setItem(
        'roblaude-auth',
        JSON.stringify({
          state: { token: 'smoke-fake-token', user: { id: 1, email: 'smoke@x.com', name: 'Smoke', role: 'USER' } },
          version: 0,
        }),
      )
    })

    // stub les appels backend pour ne pas attendre des 401 reels
    await page.route('**/api/**', (route) => route.fulfill({ status: 200, body: '[]' }))
    // stub les WS aussi (le hook va tenter un connect — laissons echouer mais
    // le shell s'affiche quand meme)
    await page.goto('/mapping')

    // titre + boutons cles
    await expect(page.getByRole('heading', { name: 'Mode mapping' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Demarrer/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Arreter/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Sauvegarder/ })).toBeVisible()
  })
})
