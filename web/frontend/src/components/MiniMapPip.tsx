import { useEffect, useRef } from 'react'
import { useMappingStore } from '@/stores/mappingStore'

// Mini-map picture-in-picture (PIP) en bas a droite : version reduite de la
// carte SLAM + position robot. Visible quand on est en plein ecran ou quand
// la carte principale est masquee.

const PIP_W = 180
const PIP_H = 120

export function MiniMapPip() {
  const { mapPngUrl, mapMeta, robotPose } = useMappingStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapPngUrl || !mapMeta) return
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
  }, [mapPngUrl, mapMeta, robotPose])

  if (!mapPngUrl) return null
  return (
    <div className="fixed bottom-4 right-4 z-30 bg-gray-950 border border-gray-700 rounded shadow-lg p-1">
      <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} />
      <div className="text-[9px] text-gray-500 text-center mt-0.5 font-mono">PIP</div>
    </div>
  )
}
