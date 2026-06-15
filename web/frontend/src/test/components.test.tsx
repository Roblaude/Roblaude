import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { MissionProgress } from '../components/MissionProgress'
import { BottomNav } from '../components/BottomNav'
import { DegradedModeBanner } from '../components/DegradedModeBanner'

// `global` existe au runtime (jsdom/node) mais pas dans la lib TS DOM
declare const global: { fetch: unknown }

describe('StatusBadge', () => {
  it('affiche le label du statut', () => {
    render(<StatusBadge status="PENDING" />)
    expect(screen.getByText('En attente')).toBeInTheDocument()
  })
  it('gère un sous-état UC-02', () => {
    render(<StatusBadge status="GRASPING" />)
    expect(screen.getByText('Saisie')).toBeInTheDocument()
  })
})

describe('MissionProgress', () => {
  it('rend les étapes transport', () => {
    render(<MissionProgress status="NAVIGATING_TO_PICKUP" type="TRANSPORT" />)
    expect(screen.getByText('Vers la collecte')).toBeInTheDocument()
    expect(screen.getByText('Livré')).toBeInTheDocument()
  })
  it('rend les étapes pick & place', () => {
    render(<MissionProgress status="GRASPING" type="PICK_AND_PLACE" />)
    expect(screen.getByText('Saisie')).toBeInTheDocument()
    expect(screen.getByText('Dépôt')).toBeInTheDocument()
  })
  it('affiche un état d échec', () => {
    render(<MissionProgress status="FAILED" type="TRANSPORT" />)
    expect(screen.getByText('Échec')).toBeInTheDocument()
  })
})

describe('BottomNav', () => {
  it('rend les liens de navigation mobile', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>,
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Profil')).toBeInTheDocument()
  })
})

describe('DegradedModeBanner', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('ne montre rien quand le backend répond', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<DegradedModeBanner />)
    expect(screen.queryByText(/Backend hors-ligne/)).toBeNull()
  })

  it('affiche le banner après plusieurs échecs', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockRejectedValue(new Error('down'))
    render(<DegradedModeBanner />)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(screen.getByText(/Backend hors-ligne/)).toBeInTheDocument()
  })
})
