import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Play, Square, Save, Wifi, WifiOff, MapPin } from 'lucide-react'
import { useRobotStore } from '../stores/robotStore'
import { useMappingStore } from '../stores/mappingStore'
import { useMappingTelemetry } from '../hooks/useMappingTelemetry'
import { useMappingStaleness } from '../hooks/useStaleness'
import { useTfStream, useTopicsStream } from '../hooks/useRobotInfraWs'
import { startMapping, stopMapping, saveMapping } from '../lib/mappingApi'
import { MappingSessionsList } from '../components/MappingSessionsList'
import { TeleopPanel } from '../components/TeleopPanel'
import { MapLive } from '../components/MapLive'
import { DockBottom } from '../components/DockBottom'
import { MiniMapPip } from '../components/MiniMapPip'
import { CameraView } from '../components/CameraView'
import { ArmViewer } from '../components/ArmViewer'
import { listAnnotations, type Annotation } from '../lib/annotationsApi'
import { listSessions } from '../lib/mappingApi'

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  IDLE: { label: 'En veille', color: 'bg-gray-700 text-gray-200' },
  STARTING: { label: 'Demarrage…', color: 'bg-yellow-600 text-white' },
  RUNNING: { label: 'Cartographie en cours', color: 'bg-green-600 text-white' },
  STOPPING: { label: 'Arret…', color: 'bg-yellow-600 text-white' },
  STOPPED: { label: 'Arrete', color: 'bg-gray-700 text-gray-200' },
  FAILED: { label: 'Echec', color: 'bg-red-600 text-white' },
}

export function MappingPage() {
  const params = useParams<{ robotId?: string }>()
  const storeRobotId = useRobotStore((s) => s.id)
  // /mapping/:robotId override le robot courant du store, sinon fallback
  // au robot par defaut (single-robot MVP).
  const parsed = params.robotId ? Number(params.robotId) : NaN
  const robotId = Number.isInteger(parsed) && parsed > 0 ? parsed : storeRobotId
  const robotConnected = useRobotStore((s) => s.connected)
  const robotPos = useRobotStore((s) => s.position)
  const { state, sessionId, mapMeta, wsConnected, failureReason, setMapping, setRobotPose, pushTrail } = useMappingStore()

  // WS telemetry (carte live + scan + plan + frontiers) + TF + Topics infra
  useMappingTelemetry(robotId, true)
  useTfStream(robotId, true)
  useTopicsStream(robotId, true)
  const stale = useMappingStaleness()

  // Synchronise robotStore.position -> mappingStore.robotPose + trail
  // (la position vient du WS legacy /ws via position_update -> robotStore).
  useEffect(() => {
    setRobotPose({ x: robotPos.x, y: robotPos.y, theta: robotPos.heading })
    if (state === 'RUNNING') pushTrail({ x: robotPos.x, y: robotPos.y })
  }, [robotPos.x, robotPos.y, robotPos.heading, state, setRobotPose, pushTrail])

  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // snapshot courant = dernier snapshot du robot (pour rattacher les annotations)
  const [currentSnapshotId, setCurrentSnapshotId] = useState<number | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])

  // resolve currentSnapshotId : on prend le dernier snapshot de la session
  // active si elle a un snapshot, sinon on tente le dernier snapshot du robot.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const sessions = await listSessions(robotId)
        for (const s of sessions) {
          const c = s._count?.snapshots ?? 0
          if (c > 0) {
            // on n'a pas l'id direct ici — il faut un fetch supplementaire.
            // Pour MVP : on garde currentSnapshotId null si pas dispo, l'utilisateur
            // doit sauvegarder une carte pour creer des annotations.
            // todo: endpoint snapshots/latest?robotId=...
            return
          }
        }
        if (!cancelled) setCurrentSnapshotId(null)
      } catch {
        /* ignore */
      }
    })()
    return () => { cancelled = true }
  }, [robotId, refreshKey])

  useEffect(() => {
    if (!currentSnapshotId) {
      setAnnotations([])
      return
    }
    void listAnnotations(currentSnapshotId).then(setAnnotations).catch(() => setAnnotations([]))
  }, [currentSnapshotId])

  const onStart = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await startMapping(robotId)
      setMapping('STARTING', r.sessionId)
      toast.success(`Session ${r.sessionId} demarree`)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'erreur start')
    } finally {
      setBusy(false)
    }
  }

  const onStop = async (): Promise<void> => {
    if (!sessionId) return
    setBusy(true)
    try {
      await stopMapping(sessionId)
      setMapping('STOPPING', sessionId)
      toast.success('Arret demande')
      setRefreshKey((k) => k + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'erreur stop')
    } finally {
      setBusy(false)
    }
  }

  const onSave = async (): Promise<void> => {
    if (!sessionId) return
    setBusy(true)
    try {
      const r = await saveMapping(sessionId)
      toast.success(`Carte sauvegardee (snapshot #${r.snapshotId})`)
      setRefreshKey((k) => k + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'erreur save')
    } finally {
      setBusy(false)
    }
  }

  const canStart = state === 'IDLE' || state === 'STOPPED' || state === 'FAILED'
  const canStop = state === 'STARTING' || state === 'RUNNING'
  const canSave = state === 'RUNNING' || state === 'STOPPED'

  const badge = STATE_LABEL[state] ?? STATE_LABEL.IDLE

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-white">Mode mapping</h1>
            <p className="text-sm text-gray-500 mt-0.5">Cartographie SLAM live</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {stale && (
            <span className="px-2 py-0.5 rounded bg-yellow-600 text-white text-xs font-medium">
              Perte signal robot
            </span>
          )}
          {wsConnected ? (
            <span className="flex items-center gap-1.5 text-green-400">
              <Wifi className="w-4 h-4" /> WS connecte
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-gray-500">
              <WifiOff className="w-4 h-4" /> WS deconnecte
            </span>
          )}
        </div>
      </div>

      {/* Etat + boutons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Etat</div>
          <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${badge.color}`}>
            {badge.label}
          </span>
          {sessionId && <div className="text-xs text-gray-500 mt-2">Session #{sessionId}</div>}
          {failureReason && <div className="text-xs text-red-400 mt-2">{failureReason}</div>}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Robot</div>
          <div className="text-white font-medium">{useRobotStore.getState().name}</div>
          <div className={`text-xs mt-1 ${robotConnected ? 'text-green-400' : 'text-gray-500'}`}>
            {robotConnected ? 'En ligne' : 'Hors ligne'}
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="text-xs text-gray-500 uppercase mb-1">Carte</div>
          {mapMeta ? (
            <>
              <div className="text-white text-sm">
                {mapMeta.width} × {mapMeta.height} px
              </div>
              <div className="text-xs text-gray-500 mt-1">
                resolution {mapMeta.resolution.toFixed(3)} m/px
              </div>
            </>
          ) : (
            <div className="text-gray-500 text-sm">en attente…</div>
          )}
        </div>
      </div>

      {/* Boutons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={onStart}
          disabled={!canStart || busy || !robotConnected}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded font-medium"
        >
          <Play className="w-4 h-4" /> Demarrer
        </button>
        <button
          onClick={onStop}
          disabled={!canStop || busy}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded font-medium"
        >
          <Square className="w-4 h-4" /> Arreter
        </button>
        <button
          onClick={onSave}
          disabled={!canSave || busy}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded font-medium"
        >
          <Save className="w-4 h-4" /> Sauvegarder
        </button>
      </div>

      {/* Carte live + panneaux cote a cote */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-medium text-gray-300">Carte SLAM live</h2>
            {mapMeta && (
              <span className="text-[10px] text-gray-500 ml-auto">
                {mapMeta.width}×{mapMeta.height}px · {mapMeta.resolution.toFixed(3)}m/px
              </span>
            )}
          </div>
          <MapLive
            currentSnapshotId={currentSnapshotId}
            annotations={annotations}
            onAnnotationCreated={(a) => setAnnotations((list) => [...list, a])}
          />
        </div>

        <div className="space-y-4">
          <TeleopPanel enabled={state === 'RUNNING' && wsConnected} />
          <MappingSessionsList robotId={robotId} refreshKey={refreshKey} />
        </div>
      </div>

      <DockBottom />
      <MiniMapPip />
      <CameraView robotId={robotId} />
      <ArmViewer robotId={robotId} />
    </div>
  )
}
