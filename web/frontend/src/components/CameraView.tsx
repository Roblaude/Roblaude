import { useEffect, useRef, useState } from 'react'
import { Camera, Maximize2, Minimize2, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

// Vue camera POV du robot. Recoit des frames PNG/JPEG via WS telemetry sur
// un byte de type 0x02 (similaire au map). Le robot publie sur
// roblaude/{id}/telemetry/camera (binary retained, throttle 5-10 Hz).
// Composant flotant en haut-droite par defaut — toggle plein ecran via
// Fullscreen API.

const TYPE_CAMERA_FRAME = 0x02

interface Props {
  robotId: number
  // si false, on cache completement (pas de WS ouvert).
  enabled?: boolean
}

export function CameraView({ robotId, enabled = true }: Props) {
  const token = useAuthStore((s) => s.token)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [connected, setConnected] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !token) return
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // on reutilise /ws/robots/:id/telemetry qui broadcast deja les binary
    // frames — on filtre cote client sur le byte de type.
    const url = `${proto}//${window.location.host}/ws/robots/${robotId}/telemetry?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    ws.onopen = (): void => setConnected(true)
    ws.onclose = (): void => setConnected(false)
    ws.onmessage = (e): void => {
      if (!(e.data instanceof ArrayBuffer)) return
      const view = new Uint8Array(e.data)
      if (view.length < 2 || view[0] !== TYPE_CAMERA_FRAME) return
      const data = view.slice(1)
      const blob = new Blob([data], { type: 'image/jpeg' })
      const next = URL.createObjectURL(blob)
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current)
      prevUrlRef.current = next
      setFrameUrl(next)
    }

    return () => {
      ws.close()
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current)
        prevUrlRef.current = null
      }
    }
  }, [robotId, enabled, token])

  useEffect(() => {
    const onFs = (): void => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFs = (): void => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) void el.requestFullscreen()
    else void document.exitFullscreen()
  }

  if (!enabled || hidden) {
    return hidden ? (
      <button
        onClick={() => setHidden(false)}
        className="fixed top-20 right-4 z-30 bg-gray-900 border border-gray-700 rounded p-2 text-gray-300 hover:text-white"
        aria-label="Re-afficher camera POV"
      >
        <Camera className="w-4 h-4" />
      </button>
    ) : null
  }

  return (
    <div
      ref={containerRef}
      className={`bg-black border border-gray-700 rounded shadow-lg overflow-hidden z-30 ${
        fullscreen ? '' : 'fixed top-20 right-4 w-64'
      }`}
    >
      <div className="flex items-center justify-between bg-gray-900 px-2 py-1 border-b border-gray-800">
        <div className="flex items-center gap-1.5 text-xs text-gray-300">
          <Camera className="w-3 h-3" /> POV
          <span className={`size-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-600'}`} />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleFs}
            className="text-gray-400 hover:text-white p-0.5"
            aria-label={fullscreen ? 'Quitter plein ecran' : 'Plein ecran'}
          >
            {fullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setHidden(true)}
            className="text-gray-400 hover:text-white p-0.5"
            aria-label="Cacher"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className={`flex items-center justify-center bg-black ${fullscreen ? 'h-screen' : 'aspect-video'}`}>
        {frameUrl ? (
          <img
            src={frameUrl}
            alt="Camera POV"
            className={fullscreen ? 'max-h-screen max-w-screen' : 'w-full h-full object-cover'}
          />
        ) : (
          <div className="text-gray-600 text-xs p-4 text-center">
            {connected ? 'En attente du premier frame…' : 'WS deconnecte'}
          </div>
        )}
      </div>
    </div>
  )
}
