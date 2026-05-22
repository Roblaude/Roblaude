import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Bot, Maximize2, Minimize2, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

// Viewer 3D du bras robotique (Three.js). Robot stylise 5-DOF :
// base (yaw) -> shoulder (pitch) -> elbow (pitch) -> wrist1 (pitch) -> wrist2 (yaw) -> gripper.
//
// Les positions des joints viennent du WS telemetry sur un message JSON
// { type: 'joint_states', positions: number[] } (radians).
// En attendant les donnees reelles, on auto-anime un mouvement sinusoidal
// pour montrer que ca marche.

interface Props {
  robotId: number
  enabled?: boolean
}

const JOINT_NAMES = ['base', 'shoulder', 'elbow', 'wrist1', 'wrist2'] as const

export function ArmViewer({ robotId, enabled = true }: Props) {
  const token = useAuthStore((s) => s.token)
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    joints: THREE.Object3D[]
  } | null>(null)
  const [hidden, setHidden] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [hasRealData, setHasRealData] = useState(false)

  // setup three.js scene
  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    const w = container.clientWidth
    const h = container.clientHeight
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0a)

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100)
    camera.position.set(0.7, 0.6, 1.0)
    camera.lookAt(0, 0.3, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
    const dir = new THREE.DirectionalLight(0xffffff, 0.7)
    dir.position.set(1, 2, 1)
    scene.add(dir)

    // sol grid
    const grid = new THREE.GridHelper(2, 10, 0x1f2937, 0x111827)
    scene.add(grid)

    // build articulated chain via Object3D nested
    // colors par segment
    const mat = (color: number) => new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5 })

    const base = new THREE.Object3D()
    base.position.set(0, 0, 0)
    scene.add(base)
    base.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.05, 16), mat(0x22d3ee)))

    const shoulder = new THREE.Object3D()
    shoulder.position.set(0, 0.025, 0)
    base.add(shoulder)
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.25, 0.05), mat(0x3b82f6))
    upperArm.position.set(0, 0.125, 0)
    shoulder.add(upperArm)

    const elbow = new THREE.Object3D()
    elbow.position.set(0, 0.25, 0)
    shoulder.add(elbow)
    const lowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), mat(0x6366f1))
    lowerArm.position.set(0, 0.1, 0)
    elbow.add(lowerArm)

    const wrist1 = new THREE.Object3D()
    wrist1.position.set(0, 0.2, 0)
    elbow.add(wrist1)
    const wristMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), mat(0xa855f7))
    wristMesh.position.set(0, 0.04, 0)
    wrist1.add(wristMesh)

    const wrist2 = new THREE.Object3D()
    wrist2.position.set(0, 0.08, 0)
    wrist1.add(wrist2)
    const gripper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.04), mat(0xec4899))
    gripper.position.set(0, 0.02, 0)
    wrist2.add(gripper)

    sceneRef.current = { scene, camera, renderer, joints: [base, shoulder, elbow, wrist1, wrist2] }

    // Pose de repos par defaut — bras un peu plie vers l'avant pour ne pas
    // ressembler a un poteau droit, mais STATIQUE (pas d'auto-anim).
    // Quand joint_states reels arrivent, ils ecrasent ces valeurs.
    shoulder.rotation.x = -0.3
    elbow.rotation.x = 0.8
    wrist1.rotation.x = -0.2

    let rafId: number
    const animate = (): void => {
      rafId = requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }
    animate()

    const onResize = (): void => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      container.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [enabled])

  // listen joint_states via WS telemetry (re-utilise le meme endpoint)
  useEffect(() => {
    if (!enabled || !token) return
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws/robots/${robotId}/telemetry?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    ws.onmessage = (e): void => {
      if (typeof e.data !== 'string') return
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'joint_states' && Array.isArray(msg.positions)) {
          const ref = sceneRef.current
          if (!ref) return
          const p = msg.positions as number[]
          if (p[0] != null) ref.joints[0].rotation.y = p[0]
          if (p[1] != null) ref.joints[1].rotation.x = p[1]
          if (p[2] != null) ref.joints[2].rotation.x = p[2]
          if (p[3] != null) ref.joints[3].rotation.x = p[3]
          if (p[4] != null) ref.joints[4].rotation.y = p[4]
          setHasRealData(true)
        }
      } catch {
        /* ignore */
      }
    }
    return () => ws.close()
  }, [enabled, token, robotId])

  useEffect(() => {
    const onFs = (): void => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFs = (): void => {
    const el = containerRef.current?.parentElement
    if (!el) return
    if (!document.fullscreenElement) void el.requestFullscreen()
    else void document.exitFullscreen()
  }

  if (!enabled || hidden) {
    return hidden ? (
      <button
        onClick={() => setHidden(false)}
        className="fixed bottom-32 right-4 z-30 bg-gray-900 border border-gray-700 rounded p-2 text-gray-300 hover:text-white"
        aria-label="Re-afficher bras 3D"
      >
        <Bot className="w-4 h-4" />
      </button>
    ) : null
  }

  return (
    <div
      className={`bg-black border border-gray-700 rounded shadow-lg overflow-hidden z-30 ${
        fullscreen ? 'fixed inset-0' : 'fixed bottom-32 right-4 w-64'
      }`}
    >
      <div className="flex items-center justify-between bg-gray-900 px-2 py-1 border-b border-gray-800">
        <div className="flex items-center gap-1.5 text-xs text-gray-300">
          <Bot className="w-3 h-3" /> Bras 3D
          <span className={`text-[10px] ${hasRealData ? 'text-green-400' : 'text-gray-500'}`}>
            {hasRealData ? 'live' : 'pose repos'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleFs} className="text-gray-400 hover:text-white p-0.5" aria-label="plein ecran">
            {fullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          <button onClick={() => setHidden(true)} className="text-gray-400 hover:text-white p-0.5" aria-label="cacher">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div ref={containerRef} className={fullscreen ? 'h-screen w-screen' : 'aspect-video w-full'} />
      {JOINT_NAMES && null}
    </div>
  )
}
