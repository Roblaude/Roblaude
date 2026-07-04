import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Wrench, RefreshCw, ChevronDown, ChevronRight, Activity } from 'lucide-react'
import { toast } from 'sonner'
import { useRobotStore } from '../stores/robotStore'
import { getRobotHealth, runRepair, REPAIR_LABELS, type RobotHealth, type RepairAction } from '../lib/repairApi'
import { fetchRobotLogs } from '../lib/sshApi'

// Page admin /admin/repair : sante du robot en clair + reparations 1-clic.
// Poll la sante toutes les 4s, genere un fil d'evenements lisible, et permet
// de declencher des actions de reparation (enum ferme cote back).

type Level = 'ok' | 'warn' | 'bad' | 'info'
interface FeedItem { id: number; t: string; level: Level; msg: string }

interface Subsystem {
  key: 'stm32' | 'ybNode' | 'agent' | 'm3pro'
  label: string
  isGood: (h: RobotHealth) => boolean
  isBad: (h: RobotHealth) => boolean
  repair: RepairAction
}

const SUBSYSTEMS: Subsystem[] = [
  { key: 'stm32', label: 'STM32 (base/moteurs/bras)', isGood: (h) => h.stm32 === 'ok', isBad: (h) => h.stm32 === 'down', repair: 'reconnect_stm32' },
  { key: 'ybNode', label: 'YB_Node (driver)', isGood: (h) => h.ybNode === 'ok', isBad: (h) => h.ybNode === 'down', repair: 'reconnect_stm32' },
  { key: 'agent', label: 'Agent micro-ROS', isGood: (h) => h.agent === 'active', isBad: (h) => h.agent === 'dead', repair: 'reconnect_stm32' },
  { key: 'm3pro', label: 'Stack ROS (m3pro)', isGood: (h) => h.m3pro === 'up', isBad: (h) => h.m3pro === 'down', repair: 'restart_ros' },
]

const LOG_UNITS = [
  { value: 'micro-ros-agent.service', label: 'Agent micro-ROS' },
  { value: 'roblaude-stm32-healthcheck.service', label: 'Healthcheck' },
]

function dotClass(level: Level): string {
  return level === 'ok' ? 'bg-emerald-400'
    : level === 'warn' ? 'bg-amber-400'
    : level === 'bad' ? 'bg-destructive'
    : 'bg-muted-foreground'
}

function cardClass(level: Level): string {
  return level === 'ok' ? 'border-emerald-500/30 bg-emerald-500/5'
    : level === 'warn' ? 'border-amber-500/30 bg-amber-500/5'
    : level === 'bad' ? 'border-destructive/40 bg-destructive/5'
    : 'border-muted-foreground/20 bg-muted-foreground/5'
}

function hhmmss(): string {
  return new Date().toLocaleTimeString('fr-FR')
}

export function RobotRepairPage() {
  const robotId = useRobotStore((s) => s.id)
  const [health, setHealth] = useState<RobotHealth | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [busy, setBusy] = useState<RepairAction | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [logUnit, setLogUnit] = useState(LOG_UNITS[0].value)
  const [logs, setLogs] = useState('')
  const [loadingLogs, setLoadingLogs] = useState(false)

  const prev = useRef<RobotHealth | null>(null)
  const feedId = useRef(0)

  const push = (level: Level, msg: string): void => {
    feedId.current += 1
    const item: FeedItem = { id: feedId.current, t: hhmmss(), level, msg }
    setFeed((f) => [item, ...f].slice(0, 60))
  }

  // compare l'ancien et le nouvel etat -> messages en clair
  const diff = (h: RobotHealth): void => {
    const p = prev.current
    if (!p) {
      push(h.reachable ? 'info' : 'bad', h.reachable ? 'Connecté au robot' : 'Robot injoignable')
    } else {
      if (p.reachable && !h.reachable) push('bad', 'Perte de contact avec le robot')
      if (!p.reachable && h.reachable) push('ok', 'Contact rétabli')
      for (const s of SUBSYSTEMS) {
        const was = s.isGood(p), now = s.isGood(h)
        if (was && !now) push('bad', `${s.label} : tombé`)
        if (!was && now) push('ok', `${s.label} : rétabli`)
      }
    }
    prev.current = h
  }

  useEffect(() => {
    let alive = true
    const tick = async (): Promise<void> => {
      try {
        const h = await getRobotHealth(robotId)
        if (!alive) return
        diff(h)
        setHealth(h)
      } catch {
        if (!alive) return
        if (prev.current?.reachable !== false) push('bad', 'Santé indisponible (backend ou robot KO)')
        prev.current = null
        setHealth(null)
      }
    }
    void tick()
    const id = setInterval(tick, 4000)
    return () => { alive = false; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robotId])

  const repair = async (action: RepairAction): Promise<void> => {
    if (action === 'reboot' && !window.confirm('Redémarrer complètement le Jetson ? (~90s d\'indisponibilité)')) return
    if (action === 'shutdown' && !window.confirm('Éteindre le robot proprement ? (range le bras puis coupe — il faudra le rallumer physiquement)')) return
    setBusy(action)
    push('info', `🔧 ${REPAIR_LABELS[action]} lancé...`)
    try {
      const r = await runRepair(robotId, action, action === 'reboot' || action === 'shutdown')
      if (r.ok) { push('ok', `${REPAIR_LABELS[action]} : OK${r.note ? ` (${r.note})` : ''}`); toast.success(REPAIR_LABELS[action]) }
      else { push('warn', `${REPAIR_LABELS[action]} : code ${r.code}`); toast.warning(`${REPAIR_LABELS[action]} (code ${r.code})`) }
    } catch (e) {
      push('bad', `${REPAIR_LABELS[action]} : échec — ${e instanceof Error ? e.message : 'erreur'}`)
      toast.error(e instanceof Error ? e.message : 'échec réparation')
    } finally {
      setBusy(null)
    }
  }

  const loadLogs = async (): Promise<void> => {
    setLoadingLogs(true)
    try {
      const r = await fetchRobotLogs(robotId, { unit: logUnit, lines: 150 })
      setLogs(r.stdout || '(aucune ligne)')
    } catch (e) {
      setLogs(`erreur: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setLoadingLogs(false)
    }
  }

  // statut "humain" par carte
  const cardLevel = (s: Subsystem): Level => {
    if (!health) return 'info'
    if (s.isGood(health)) return 'ok'
    if (s.isBad(health)) return 'bad'
    return 'info'
  }
  const batteryLevel: Level = health?.battery == null ? 'info' : health.battery < 15 ? 'bad' : health.battery < 30 ? 'warn' : 'ok'

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="size-5" /></Link>
        <Wrench className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">Réparation robot</h1>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`size-2 rounded-full ${health?.reachable ? 'bg-emerald-400' : 'bg-destructive'}`} />
          {health?.reachable ? 'en ligne' : 'hors ligne'}
        </span>
      </div>

      {/* cartes sante */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {SUBSYSTEMS.map((s) => {
          const lvl = cardLevel(s)
          const showFix = lvl === 'bad' && health?.reachable
          return (
            <div key={s.key} className={`rounded-lg border p-3 ${cardClass(lvl)}`}>
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${dotClass(lvl)}`} />
                <span className="text-sm font-medium">{s.label}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {lvl === 'ok' ? 'OK' : lvl === 'bad' ? 'à réparer' : 'inconnu'}
              </div>
              {showFix && (
                <button
                  onClick={() => repair(s.repair)}
                  disabled={busy !== null}
                  className="mt-2 w-full rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {busy === s.repair ? '…' : 'Réparer'}
                </button>
              )}
            </div>
          )
        })}

        {/* batterie */}
        <div className={`rounded-lg border p-3 ${cardClass(batteryLevel)}`}>
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${dotClass(batteryLevel)}`} />
            <span className="text-sm font-medium">Batterie</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {health?.battery == null ? 'inconnue' : `${health.battery}%`}
          </div>
        </div>

        {/* connexion */}
        <div className={`rounded-lg border p-3 ${cardClass(health?.reachable ? 'ok' : 'bad')}`}>
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${dotClass(health?.reachable ? 'ok' : 'bad')}`} />
            <span className="text-sm font-medium">Connexion</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{health?.reachable ? 'OK' : 'injoignable'}</div>
        </div>
      </div>

      {/* actions globales */}
      <div className="flex flex-wrap gap-2">
        {(['reconnect_stm32', 'restart_ros', 'resync_clock', 'start_perception', 'reboot', 'shutdown'] as RepairAction[]).map((a) => (
          <button
            key={a}
            onClick={() => repair(a)}
            disabled={busy !== null}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 ${a === 'reboot' || a === 'shutdown' ? 'border-destructive/40 text-destructive' : 'border-border'}`}
          >
            {busy === a ? '…' : REPAIR_LABELS[a]}
          </button>
        ))}
      </div>

      {/* fil en clair */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Activity className="size-4 text-primary" /> Journal en clair
        </div>
        <div className="rounded-lg border bg-card max-h-72 overflow-y-auto divide-y divide-border/50">
          {feed.length === 0 && <div className="p-3 text-xs text-muted-foreground">en attente…</div>}
          {feed.map((f) => (
            <div key={f.id} className="flex items-start gap-2 px-3 py-1.5 text-xs">
              <span className={`mt-1 size-2 shrink-0 rounded-full ${dotClass(f.level)}`} />
              <span className="font-mono text-muted-foreground">{f.t}</span>
              <span className="text-foreground">{f.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* logs bruts repliables */}
      <div>
        <button onClick={() => setShowLogs((v) => !v)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          {showLogs ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Logs bruts (debug)
        </button>
        {showLogs && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <select value={logUnit} onChange={(e) => setLogUnit(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-xs">
                {LOG_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
              <button onClick={loadLogs} disabled={loadingLogs} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50">
                <RefreshCw className={`size-3 ${loadingLogs ? 'animate-spin' : ''}`} /> charger
              </button>
            </div>
            <pre className="max-h-80 overflow-auto rounded-lg border bg-black/40 p-3 text-[11px] leading-snug text-muted-foreground whitespace-pre-wrap">{logs || '(clique sur charger)'}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
