import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import URDFLoader from 'urdf-loader'
import { Bot, Maximize2, Minimize2, X, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useMappingStore } from '@/stores/mappingStore'
import { armPoseToUrdfJoints } from '@/lib/armUrdf'

// Viewer 3D fidele du bras Yahboom M3 Pro via urdf-loader.
// Charge l'URDF reel servi par le backend (/robot_assets/m3pro.urdf.xml)
// et applique les /joint_states recus via WS pour animer.
//
// Si l'URDF n'est pas dispo (pas encore fetch via fetch_urdf_from_robot.sh),
// affiche un message explicite — surtout pas un faux bras anime.

interface Props {
  robotId: number
  enabled?: boolean
}

interface JointMap {
  [name: string]: { setJointValue: (v: number) => void }
}

export function URDFViewer({ robotId, enabled = true }: Props) {
  const token = useAuthStore((s) => s.token)
  const armPose = useMappingStore((s) => s.armPose)
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    robot: THREE.Object3D | null
    joints: JointMap | null
  } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    const w = container.clientWidth
    const h = container.clientHeight
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0a)
    scene.up.set(0, 0, 1) // ROS = Z up

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 100)
    camera.position.set(0.5, -0.5, 0.6)
    camera.up.set(0, 0, 1)
    camera.lookAt(0, 0, 0.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
    const dir = new THREE.DirectionalLight(0xffffff, 0.7)
    dir.position.set(1, 1, 2)
    scene.add(dir)
    scene.add(new THREE.GridHelper(2, 10, 0x1f2937, 0x111827))

    sceneRef.current = { scene, camera, renderer, robot: null, joints: null }

    // Charge l'URDF
    const loader = new URDFLoader()
    // Fix le chemin des meshes (package://M3Pro/meshes/X.STL -> /robot_assets/meshes/X.STL)
    loader.packages = { M3Pro: '/robot_assets' }
    loader.load(
      '/robot_assets/m3pro.urdf.xml',
      (robot: THREE.Object3D & { joints?: JointMap }) => {
        scene.add(robot)
        const ref = sceneRef.current
        if (ref) {
          ref.robot = robot
          ref.joints = robot.joints ?? null
        }
        setStatus('ready')
      },
      undefined,
      (err: ErrorEvent) => {
        const msg = err instanceof Error ? err.message : 'URDF introuvable'
        // si fichier absent (404), affiche message specifique
        setStatus(msg.includes('404') || msg.includes('Not Found') ? 'missing' : 'error')
        setErrorMsg(msg)
      },
    )

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
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
      sceneRef.current = null
    }
  }, [enabled])

  // Ecoute joint_states via WS telemetry et applique sur les joints urdf
  useEffect(() => {
    if (!enabled || !token) return
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws/robots/${robotId}/telemetry?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    ws.onmessage = (e): void => {
      if (typeof e.data !== 'string') return
      try {
        const msg = JSON.parse(e.data)
        if (msg.type !== 'joint_states') return
        const ref = sceneRef.current
        if (!ref || !ref.joints || !Array.isArray(msg.names) || !Array.isArray(msg.positions)) return
        // robot open-loop : joint_states publie 0 partout (pas d'encodeurs).
        // on ignore ces messages nuls pour ne pas ecraser la pose miroir.
        if (msg.positions.every((p: number) => p === 0)) return
        // mappe par nom (vraie cinematique URDF, pas un mapping invente)
        for (let i = 0; i < msg.names.length; i++) {
          const jointName = msg.names[i]
          const pos = msg.positions[i]
          const joint = ref.joints[jointName]
          if (joint && typeof pos === 'number') {
            joint.setJointValue(pos)
          }
        }
      } catch {
        /* ignore */
      }
    }
    return () => ws.close()
  }, [enabled, token, robotId])

  // miroir : applique la derniere pose commandee (degres) sur le modele 3D.
  // sert tant que le robot reste open-loop — sinon les joint_states reels prennent le relais.
  useEffect(() => {
    if (status !== 'ready' || !armPose) return
    const ref = sceneRef.current
    if (!ref?.joints) return
    for (const [name, val] of Object.entries(armPoseToUrdfJoints(armPose))) {
      ref.joints[name]?.setJointValue(val)
    }
  }, [armPose, status])

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
          <Bot className="w-3 h-3" /> Bras 3D (URDF)
          <span className={`text-[10px] ${
            status === 'ready' ? 'text-green-400'
              : status === 'loading' ? 'text-yellow-400'
              : 'text-red-400'
          }`}>
            {status === 'ready' ? 'live' : status === 'loading' ? 'charge…' : status === 'missing' ? 'URDF absent' : 'err'}
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
      {status === 'missing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-center p-3">
          <div className="text-xs text-gray-300">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mx-auto mb-1.5" />
            URDF non récupéré.<br />
            Lance <code className="text-cyan-400">./robot/scripts/fetch_urdf_from_robot.sh</code>
          </div>
        </div>
      )}
      {status === 'error' && errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-center p-3">
          <div className="text-xs text-red-400">
            <AlertTriangle className="w-5 h-5 mx-auto mb-1.5" />
            Erreur URDF :<br />{errorMsg}
          </div>
        </div>
      )}
    </div>
  )
}
