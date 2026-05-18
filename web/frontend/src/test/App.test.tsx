import { describe, it, expect } from 'vitest'

describe('Frontend', () => {
  it('les modules React existent', async () => {
    const React = await import('react')
    expect(React).toBeDefined()
    expect(React.useState).toBeDefined()
  })

  it('le module App peut etre importe', async () => {
    const mod = await import('../App')
    expect(mod.default).toBeDefined()
  })

  it('les stores Zustand peuvent etre importes', async () => {
    const missionStore = await import('../stores/missionStore')
    expect(missionStore).toBeDefined()
  })
})
