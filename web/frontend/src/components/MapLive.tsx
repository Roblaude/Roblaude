import { useEffect, useRef, useState, useCallback } from 'react'
import { Maximize2, Minimize2, Layers } from 'lucide-react'
import { useMappingStore } from '@/stores/mappingStore'
import { worldToPixel } from '@/lib/mapProjection'

// Carte SLAM live avec overlay canvas (scan laser, plan, frontiers, robot pose).
// Mode plein ecran via Fullscreen API.

interface LayerToggles {
  scan: boolean
  plan: boolean
  frontiers: boolean
  trail: boolean
}

export function MapLive() {
  const { mapPngUrl, mapMeta, scan, plan, frontiers, trail, robotPose } = useMappingStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [layers, setLayers] = useState<LayerToggles>({
    scan: true,
    plan: true,
    frontiers: true,
    trail: true,
  })
  const [showLayerMenu, setShowLayerMenu] = useState(false)

  const toggleFullscreen = useCallback((): void => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      void el.requestFullscreen()
    } else {
      void document.exitFullscreen()
    }
  }, [])

  useEffect(() => {
    const onFs = (): void => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // redessine le canvas a chaque changement de scan/plan/trail/etc.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapMeta) return
    canvas.width = mapMeta.width
    canvas.height = mapMeta.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // robot position
    if (robotPose) {
      const p = worldToPixel(mapMeta, robotPose.x, robotPose.y)
      // fleche orientation
      const len = 12
      const dx = Math.cos(robotPose.theta) * len
      const dy = -Math.sin(robotPose.theta) * len
      ctx.strokeStyle = '#22d3ee'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x + dx, p.y + dy)
      ctx.stroke()
      ctx.fillStyle = '#06b6d4'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // trail
    if (layers.trail && trail.length > 1) {
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      const first = worldToPixel(mapMeta, trail[0].x, trail[0].y)
      ctx.moveTo(first.x, first.y)
      for (let i = 1; i < trail.length; i++) {
        const pt = worldToPixel(mapMeta, trail[i].x, trail[i].y)
        ctx.lineTo(pt.x, pt.y)
      }
      ctx.stroke()
    }

    // plan (chemin Nav2)
    if (layers.plan && plan && plan.length > 1) {
      ctx.strokeStyle = '#a855f7'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      const start = worldToPixel(mapMeta, plan[0].x, plan[0].y)
      ctx.moveTo(start.x, start.y)
      for (let i = 1; i < plan.length; i++) {
        const pt = worldToPixel(mapMeta, plan[i].x, plan[i].y)
        ctx.lineTo(pt.x, pt.y)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    // frontiers (zones a explorer)
    if (layers.frontiers && frontiers) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.5)'
      for (const f of frontiers) {
        const pt = worldToPixel(mapMeta, f.x, f.y)
        const r = Math.max(2, f.size / mapMeta.resolution / 2)
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // scan laser
    if (layers.scan && scan && robotPose) {
      ctx.fillStyle = 'rgba(248, 113, 113, 0.9)'
      for (let i = 0; i < scan.ranges.length; i++) {
        const r = scan.ranges[i]
        if (!Number.isFinite(r) || r <= 0) continue
        const angle = scan.angleMin + i * scan.angleIncrement + robotPose.theta
        const xWorld = robotPose.x + Math.cos(angle) * r
        const yWorld = robotPose.y + Math.sin(angle) * r
        const pt = worldToPixel(mapMeta, xWorld, yWorld)
        ctx.fillRect(pt.x - 0.5, pt.y - 0.5, 1.5, 1.5)
      }
    }
  }, [mapMeta, scan, plan, frontiers, trail, robotPose, layers])

  return (
    <div
      ref={containerRef}
      className={`relative bg-black border border-gray-900 rounded ${
        fullscreen ? 'flex items-center justify-center' : ''
      }`}
    >
      {/* boutons en haut a droite */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <div className="relative">
          <button
            onClick={() => setShowLayerMenu((v) => !v)}
            className="bg-gray-900/80 hover:bg-gray-800 text-gray-200 p-2 rounded border border-gray-700"
            aria-label="Couches"
          >
            <Layers className="w-4 h-4" />
          </button>
          {showLayerMenu && (
            <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded p-2 text-xs space-y-1 min-w-[120px]">
              {(['scan', 'plan', 'frontiers', 'trail'] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers[k]}
                    onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))}
                  />
                  {k}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={toggleFullscreen}
          className="bg-gray-900/80 hover:bg-gray-800 text-gray-200 p-2 rounded border border-gray-700"
          aria-label={fullscreen ? 'Quitter plein ecran' : 'Plein ecran'}
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      <div className="relative inline-block">
        {mapPngUrl ? (
          <>
            <img
              src={mapPngUrl}
              alt="Carte SLAM"
              className={fullscreen ? 'max-h-screen max-w-screen' : 'max-w-full max-h-[600px]'}
              style={{ imageRendering: 'pixelated', display: 'block' }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ imageRendering: 'pixelated' }}
            />
          </>
        ) : (
          <div className="text-gray-600 text-sm py-24 px-12">
            Aucune carte disponible — demarre une session
          </div>
        )}
      </div>
    </div>
  )
}
