import { useEffect, useRef, useState } from 'react'
import { Map as MapIcon, Minus, X } from 'lucide-react'
import { useMappingStore } from '@/stores/mappingStore'
import { useDraggable } from '@/hooks/useDraggable'

// Mini-map picture-in-picture (PIP) : version reduite de la carte SLAM +
// position robot. Panneau flottant DEPLACABLE (drag entete) + reductible + fermable.

const PIP_W = 180
const PIP_H = 120

export function MiniMapPip({ onClose }: { onClose?: () => void } = {}) {
  const { mapPngUrl, mapMeta, robotPose } = useMappingStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hidden, setHidden] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const { pos, onDragStart } = useDraggable({ x: 16, y: window.innerHeight - 200 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapPngUrl || !mapMeta || minimized) return
    canvas.width = PIP_W
    canvas.height = PIP_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.onload = (): void => {
      ctx.clearRect(0, 0, PIP_W, PIP_H)
      // fit la carte dans le PIP en preservant le ratio
      const scale = Math.min(PIP_W / img.width, PIP_H / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const offX = (PIP_W - w) / 2
      const offY = (PIP_H - h) / 2
      ctx.drawImage(img, offX, offY, w, h)
      // robot en cyan
      if (robotPose) {
        const px = ((robotPose.x - mapMeta.originX) / mapMeta.resolution) * scale + offX
        const py = PIP_H - (((robotPose.y - mapMeta.originY) / mapMeta.resolution) * scale + offY)
        ctx.fillStyle = '#06b6d4'
        ctx.beginPath()
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    img.src = mapPngUrl
  }, [mapPngUrl, mapMeta, robotPose, minimized])

  if (!mapPngUrl) return null

  if (hidden) {
    return (
      <button
        onClick={() => setHidden(false)}
        className="fixed bottom-4 left-4 z-30 bg-gray-900 border border-gray-700 rounded p-2 text-gray-300 hover:text-white"
        aria-label="Re-afficher la mini-carte"
      >
        <MapIcon className="w-4 h-4" />
      </button>
    )
  }

  return (
    <div
      className="fixed z-30 bg-gray-950 border border-gray-700 rounded shadow-lg overflow-hidden"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onPointerDown={onDragStart}
        className="flex items-center justify-between bg-gray-900 px-2 py-1 border-b border-gray-800 cursor-move select-none"
      >
        <span className="flex items-center gap-1.5 text-[10px] text-gray-300 font-mono">
          <MapIcon className="w-3 h-3" /> Mini-carte
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized((m) => !m)} className="text-gray-400 hover:text-white p-0.5" aria-label="Reduire">
            <Minus className="w-3 h-3" />
          </button>
          <button onClick={() => (onClose ? onClose() : setHidden(true))} className="text-gray-400 hover:text-white p-0.5" aria-label="Fermer">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      {!minimized && (
        <div className="p-1">
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
        </div>
      )}
    </div>
  )
}
