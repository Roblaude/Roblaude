import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Play, Square, Save, Wifi, WifiOff, MapPin } from 'lucide-react'
import { useRobotStore } from '../stores/robotStore'
import { useMappingStore } from '../stores/mappingStore'
import { useMappingTelemetry } from '../hooks/useMappingTelemetry'
import { useMappingStaleness } from '../hooks/useStaleness'
import { startMapping, stopMapping, saveMapping } from '../lib/mappingApi'
import { MappingSessionsList } from '../components/MappingSessionsList'
import { TeleopPanel } from '../components/TeleopPanel'

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  IDLE: { label: 'En veille', color: 'bg-gray-700 text-gray-200' },
  STARTING: { label: 'Demarrage…', color: 'bg-yellow-600 text-white' },
  RUNNING: { label: 'Cartographie en cours', color: 'bg-green-600 text-white' },
  STOPPING: { label: 'Arret…', color: 'bg-yellow-600 text-white' },
  STOPPED: { label: 'Arrete', color: 'bg-gray-700 text-gray-200' },
  FAILED: { label: 'Echec', color: 'bg-red-600 text-white' },
}

export function MappingPage() {
  const robotId = useRobotStore((s) => s.id)
  const robotConnected = useRobotStore((s) => s.connected)
  const { state, sessionId, mapPngUrl, mapMeta, wsConnected, failureReason, setMapping } = useMappingStore()

  // ouvre le WS telemetry (carte live)
  useMappingTelemetry(robotId, true)
  const stale = useMappingStaleness()

  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

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

      {/* Carte live + historique sessions cote a cote */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-300">Carte SLAM live</h2>
        </div>
        <div className="bg-black border border-gray-900 rounded min-h-96 flex items-center justify-center overflow-hidden">
          {mapPngUrl ? (
            <img
              src={mapPngUrl}
              alt="Carte SLAM"
              className="max-w-full max-h-[600px] object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <div className="text-gray-600 text-sm py-24">
              {state === 'RUNNING' ? 'En attente du premier frame…' : 'Demarre une session pour voir la carte'}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <TeleopPanel enabled={state === 'RUNNING' && wsConnected} />
        <MappingSessionsList robotId={robotId} refreshKey={refreshKey} />
      </div>
      </div>
    </div>
  )
}
