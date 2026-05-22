import { useEffect, useRef, useState, useCallback } from 'react'
import { Maximize2, Minimize2, Layers, MapPin as MapPinIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useMappingStore } from '@/stores/mappingStore'
import { worldToPixel, pixelToWorld } from '@/lib/mapProjection'
import { getHeatmapCells, recordVisit, CELL_SIZE_M } from '@/lib/heatmapAccumulator'
import { createAnnotation, type Annotation } from '@/lib/annotationsApi'
import { GhostLayer } from './GhostLayer'
import { useRobotStore } from '@/stores/robotStore'

// Carte SLAM live avec overlay canvas (scan, plan, frontiers, trail, heatmap)
// + annotations cliquables + mode plein ecran.

interface LayerToggles {
  scan: boolean
  plan: boolean
  frontiers: boolean
  trail: boolean
  heatmap: boolean
  annotations: boolean
  ghost: boolean
}

interface PendingAnnotation {
  x: number
  y: number
  pxX: number
  pxY: number
}

interface Props {
  // permet a la page de fournir un snapshotId pour creer des annotations.
  currentSnapshotId?: number | null
  annotations?: Annotation[]
  onAnnotationCreated?: (a: Annotation) => void
}

export function MapLive({ currentSnapshotId = null, annotations = [], onAnnotationCreated }: Props) {
  const { mapPngUrl, mapMeta, scan, plan, frontiers, trail, robotPose } = useMappingStore()
  const robotId = useRobotStore((s) => s.id)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [layers, setLayers] = useState<LayerToggles>({
    scan: true,
    plan: true,
    frontiers: true,
    trail: true,
    heatmap: false,
    annotations: true,
    ghost: false,
  })
  const [showLayerMenu, setShowLayerMenu] = useState(false)
  const [pending, setPending] = useState<PendingAnnotation | null>(null)
  const [pendingLabel, setPendingLabel] = useState('')

  // CSS fullscreen (au lieu de Fullscreen API) — comme ca les siblings
  // fixed (CameraView, ArmViewer, MiniMapPip) restent visibles dans le DOM.
  const toggleFullscreen = useCallback((): void => {
    setFullscreen((f) => !f)
  }, [])

  // Echap pour sortir du plein ecran (cohherent avec Fullscreen API natif)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // accumule les visites du robot pour la heatmap
  useEffect(() => {
    if (!robotPose) return
    recordVisit(robotPose.x, robotPose.y)
  }, [robotPose])

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

    // heatmap (sous le scan pour ne pas masquer)
    if (layers.heatmap) {
      const cells = getHeatmapCells()
      const maxVisits = cells.reduce((m, c) => Math.max(m, c.visits), 1)
      const cellPx = CELL_SIZE_M / mapMeta.resolution
      for (const c of cells) {
        const intensity = Math.min(1, c.visits / maxVisits)
        ctx.fillStyle = `rgba(251, 191, 36, ${0.15 + intensity * 0.5})`
        const pt = worldToPixel(mapMeta, c.x - CELL_SIZE_M / 2, c.y + CELL_SIZE_M / 2)
        ctx.fillRect(pt.x, pt.y, cellPx, cellPx)
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

    // annotations (au-dessus de tout pour rester visibles)
    if (layers.annotations && annotations.length > 0) {
      ctx.font = '11px monospace'
      for (const a of annotations) {
        const pt = worldToPixel(mapMeta, a.x, a.y)
        ctx.fillStyle = a.color ?? '#3b82f6'
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.stroke()
        // label en blanc avec ombre
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(pt.x + 8, pt.y - 12, ctx.measureText(a.label).width + 6, 16)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(a.label, pt.x + 11, pt.y)
      }
    }
  }, [mapMeta, scan, plan, frontiers, trail, robotPose, layers, annotations])

  // clic sur la carte pour creer une annotation (si snapshot disponible)
  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>): void => {
    if (!currentSnapshotId || !mapMeta) return
    const img = (e.currentTarget.querySelector('img') as HTMLImageElement | null)
    if (!img) return
    const rect = img.getBoundingClientRect()
    const xRatio = (e.clientX - rect.left) / rect.width
    const yRatio = (e.clientY - rect.top) / rect.height
    // l'img est rendue redimensionnee — on remappe sur les coords natives
    const pxX = xRatio * mapMeta.width
    const pxY = yRatio * mapMeta.height
    const world = pixelToWorld(mapMeta, pxX, pxY)
    setPending({ x: world.x, y: world.y, pxX, pxY })
    setPendingLabel('')
  }, [currentSnapshotId, mapMeta])

  const submitAnnotation = useCallback(async (): Promise<void> => {
    if (!pending || !pendingLabel || !currentSnapshotId) return
    try {
      const a = await createAnnotation({
        mapSnapshotId: currentSnapshotId,
        label: pendingLabel,
        x: pending.x,
        y: pending.y,
      })
      toast.success(`Annotation "${a.label}" creee`)
      onAnnotationCreated?.(a)
      setPending(null)
      setPendingLabel('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'erreur annotation')
    }
  }, [pending, pendingLabel, currentSnapshotId, onAnnotationCreated])

  return (
    <div
      ref={containerRef}
      className={`bg-black border border-gray-900 rounded ${
        fullscreen
          ? 'fixed inset-0 z-40 flex items-center justify-center'
          : 'relative'
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
            <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded p-2 text-xs space-y-1 min-w-[140px]">
              {(['scan', 'plan', 'frontiers', 'trail', 'heatmap', 'annotations', 'ghost'] as const).map((k) => (
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

      <div
        className={`relative inline-block ${currentSnapshotId ? 'cursor-crosshair' : ''}`}
        onClick={onCanvasClick}
      >
        {mapPngUrl ? (
          <>
            <img
              src={mapPngUrl}
              alt="Carte SLAM"
              className={fullscreen ? 'max-h-screen max-w-screen' : 'max-w-full max-h-[600px]'}
              style={{ imageRendering: 'pixelated', display: 'block' }}
            />
            <GhostLayer
              robotId={robotId}
              enabled={layers.ghost}
              width={mapMeta?.width ?? 0}
              height={mapMeta?.height ?? 0}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ imageRendering: 'pixelated' }}
            />
            {pending && (
              <div
                className="absolute z-20 bg-gray-900 border border-gray-700 rounded p-2 shadow-xl"
                style={{
                  left: `${(pending.pxX / (mapMeta?.width ?? 1)) * 100}%`,
                  top: `${(pending.pxY / (mapMeta?.height ?? 1)) * 100}%`,
                  transform: 'translate(8px, 8px)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2">
                  <MapPinIcon className="w-3 h-3 text-blue-400" />
                  <input
                    autoFocus
                    value={pendingLabel}
                    onChange={(e) => setPendingLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitAnnotation()
                      if (e.key === 'Escape') setPending(null)
                    }}
                    placeholder="label"
                    className="bg-black border border-gray-700 rounded px-2 py-0.5 text-xs text-white w-32"
                  />
                  <button
                    onClick={() => void submitAnnotation()}
                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => setPending(null)}
                    className="text-xs text-gray-400 hover:text-white px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
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
