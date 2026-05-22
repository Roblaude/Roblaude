// Accumule un grid de visites du robot pour dessiner une heatmap de coverage.
// Module-level singleton (un robot a la fois en MVP). Le grid est resolu en
// memoire — pas persiste. Reset au mount du composant si besoin.

const CELL_SIZE_M = 0.5

const grid = new Map<string, number>() // "ix,iy" -> visits

function cellKey(x: number, y: number): string {
  const ix = Math.floor(x / CELL_SIZE_M)
  const iy = Math.floor(y / CELL_SIZE_M)
  return `${ix},${iy}`
}

export function recordVisit(x: number, y: number): void {
  const k = cellKey(x, y)
  grid.set(k, (grid.get(k) ?? 0) + 1)
}

export function getHeatmapCells(): { x: number; y: number; visits: number }[] {
  const out: { x: number; y: number; visits: number }[] = []
  for (const [k, visits] of grid) {
    const [ix, iy] = k.split(',').map(Number)
    out.push({ x: ix * CELL_SIZE_M + CELL_SIZE_M / 2, y: iy * CELL_SIZE_M + CELL_SIZE_M / 2, visits })
  }
  return out
}

export function clearHeatmap(): void {
  grid.clear()
}

export { CELL_SIZE_M }
