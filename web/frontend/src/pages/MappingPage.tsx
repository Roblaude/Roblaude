import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Wifi, WifiOff, MapPin, Camera, Bot, Map as MapIcon } from 'lucide-react'
import { useRobotStore } from '../stores/robotStore'
import { useMappingStore } from '../stores/mappingStore'
import { useMappingTelemetry } from '../hooks/useMappingTelemetry'
import { useMappingStaleness } from '../hooks/useStaleness'
import { useTfStream, useTopicsStream } from '../hooks/useRobotInfraWs'
import { MappingSessionsList } from '../components/MappingSessionsList'
import { TeleopPanel } from '../components/TeleopPanel'
import { MapLive } from '../components/MapLive'
import { MappingWizard } from '../components/MappingWizard'
import { MiniMapPip } from '../components/MiniMapPip'
import { CameraView } from '../components/CameraView'
import { URDFViewer } from '../components/URDFViewer'
import { ArmController } from '../components/ArmController'
import { listAnnotations, type Annotation } from '../lib/annotationsApi'
import { listSessions } from '../lib/mappingApi'

export function MappingPage() {
  const params = useParams<{ robotId?: string }>()
  const storeRobotId = useRobotStore((s) => s.id)
  // /mapping/:robotId override le robot courant, sinon robot par defaut.
  const parsed = params.robotId ? Number(params.robotId) : NaN
  const robotId = Number.isInteger(parsed) && parsed > 0 ? parsed : storeRobotId
  const robotPos = useRobotStore((s) => s.position)
  const { state, wsConnected, setRobotPose, pushTrail } = useMappingStore()

  // WS telemetry (carte live + scan + plan + frontiers) + TF + Topics infra
  useMappingTelemetry(robotId, true)
  useTfStream(robotId, true)
  useTopicsStream(robotId, true)
  const stale = useMappingStaleness()

  // Synchronise robotStore.position -> mappingStore.robotPose + trail
  useEffect(() => {
    setRobotPose({ x: robotPos.x, y: robotPos.y, theta: robotPos.heading })
    if (state === 'RUNNING') pushTrail({ x: robotPos.x, y: robotPos.y })
  }, [robotPos.x, robotPos.y, robotPos.heading, state, setRobotPose, pushTrail])

  const [refreshKey] = useState(0)
  const [currentSnapshotId, setCurrentSnapshotId] = useState<number | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  // vues flottantes fermees par defaut (camera POV, bras 3D, mini-carte)
  const [tools, setTools] = useState({ camera: false, arm: false, minimap: false })

  // dernier snapshot de la session active (pour rattacher les annotations)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const sessions = await listSessions(robotId)
        if (!cancelled && !sessions.some((s) => (s._count?.snapshots ?? 0) > 0)) {
          setCurrentSnapshotId(null)
        }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [robotId, refreshKey])

  useEffect(() => {
    if (!currentSnapshotId) { setAnnotations([]); return }
    void listAnnotations(currentSnapshotId).then(setAnnotations).catch(() => setAnnotations([]))
  }, [currentSnapshotId])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-2xl font-semibold text-white">Cartographie & Localisation</h1>
            <p className="text-sm text-gray-500 mt-0.5">Suis les étapes : prépare → cartographie → sauvegarde → localise</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {stale && <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-xs font-medium">Perte signal robot</span>}
          <span className={`flex items-center gap-1.5 ${wsConnected ? 'text-emerald-400' : 'text-gray-500'}`}>
            {wsConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {wsConnected ? 'connecté' : 'déconnecté'}
          </span>
        </div>
      </div>

      {/* barre d'outils : vues flottantes (fermees par defaut) */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        <span className="text-gray-500">Vues :</span>
        {([['camera', 'Caméra POV', Camera], ['arm', 'Bras 3D', Bot], ['minimap', 'Mini-carte', MapIcon]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTools((t) => ({ ...t, [k]: !t[k] }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border ${tools[k] ? 'border-cyan-600 bg-cyan-950/40 text-cyan-300' : 'border-gray-800 bg-gray-900 text-gray-400 hover:text-white'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Carte (grande) + wizard cote a cote */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-medium text-gray-300">Carte SLAM live</h2>
            <span className="text-[10px] text-gray-500 ml-auto">molette désactivée · boutons +/− pour zoomer · glisser pour déplacer · ⛶ plein écran</span>
          </div>
          <MapLive
            currentSnapshotId={currentSnapshotId}
            annotations={annotations}
            onAnnotationCreated={(a) => setAnnotations((list) => [...list, a])}
          />
        </div>

        {/* le wizard = le guide de la soutenance */}
        <div className="lg:col-span-2">
          <MappingWizard robotId={robotId} />
        </div>
      </div>

      {/* Outils (sous la carte) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <TeleopPanel enabled={state === 'RUNNING' && wsConnected} />
        <ArmController robotId={robotId} />
        <MappingSessionsList robotId={robotId} refreshKey={refreshKey} />
      </div>

      {/* vues flottantes : fermees par defaut, ouvertes via la barre d'outils */}
      {tools.minimap && <MiniMapPip onClose={() => setTools((t) => ({ ...t, minimap: false }))} />}
      {tools.camera && <CameraView robotId={robotId} onClose={() => setTools((t) => ({ ...t, camera: false }))} />}
      {tools.arm && <URDFViewer robotId={robotId} onClose={() => setTools((t) => ({ ...t, arm: false }))} />}
    </div>
  )
}
