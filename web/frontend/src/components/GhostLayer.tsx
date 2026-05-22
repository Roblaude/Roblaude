import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { History } from 'lucide-react'

// Affiche les 2-3 derniers snapshots du robot en transparence superposes
// sur la carte courante. Permet de voir comment la carte a evolue.
// Endpoint utilise : GET /api/mapping/sessions?robotId=X qui inclut les
// snapshots ; on prend les 3 plus recents et on charge leurs PNG.

interface Props {
  robotId: number
  enabled: boolean
  // dimensions cibles (px de la carte courante) pour les positionner
  width: number
  height: number
}

interface Snapshot {
  id: number
  createdAt: string
}

export function GhostLayer({ robotId, enabled, width, height }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch(`/mapping/sessions?robotId=${robotId}`)
        if (!res.ok) return
        const sessions = await res.json() as Array<{ snapshots?: Snapshot[] }>
        const all: Snapshot[] = []
        for (const s of sessions) {
          if (s.snapshots) all.push(...s.snapshots)
        }
        all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        if (!cancelled) setSnapshots(all.slice(0, 3))
      } catch {
        /* ignore */
      }
    })()
    return () => { cancelled = true }
  }, [robotId, enabled])

  if (!enabled || snapshots.length === 0) return null

  // 3 calques d'opacite croissante : le plus ancien = plus transparent
  const opacities = [0.15, 0.25, 0.35]

  return (
    <>
      {snapshots.map((snap, i) => (
        <img
          key={snap.id}
          src={`/api/mapping/snapshots/${snap.id}/download.png`}
          alt={`ghost ${snap.id}`}
          className="absolute inset-0 pointer-events-none"
          style={{
            width,
            height,
            opacity: opacities[i] ?? 0.15,
            imageRendering: 'pixelated',
            mixBlendMode: 'screen',
          }}
        />
      ))}
      <div className="absolute top-2 left-2 z-10 bg-gray-900/80 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 flex items-center gap-1.5">
        <History className="w-3 h-3" /> {snapshots.length} ghost{snapshots.length > 1 ? 's' : ''}
      </div>
    </>
  )
}
