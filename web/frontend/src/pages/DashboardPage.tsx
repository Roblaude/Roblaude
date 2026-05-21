import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useRobotStore, type RobotStatus } from '../stores/robotStore'
import { useMissionStore } from '../stores/missionStore'
import { useAuthStore } from '../stores/authStore'
import { StatusBadge } from '../components/StatusBadge'
import { RobotMap } from '../components/RobotMap'
import {
  ArrowRight,
  Battery,
  BatteryLow,
  Compass,
  MapPin,
  Radio,
  Wifi,
  WifiOff,
  Cpu,
  ScanLine,
  Camera,
  Bot,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react'

export function DashboardPage() {
  const { user } = useAuthStore()
  const {
    name,
    status,
    batteryLevel,
    connected,
    position,
    lastSync,
    error,
    fetchStatus,
  } = useRobotStore()
  const { missions, fetchMissions, total } = useMissionStore()

  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState(() => fmtClock(new Date()))

  // boot-in animation
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // clock
  useEffect(() => {
    const id = setInterval(() => setNow(fmtClock(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  // poll robot status + missions
  useEffect(() => {
    fetchStatus()
    // stats globales : on ignore les filtres de la page Missions
    fetchMissions({ status: undefined, type: undefined, page: 1 })
    const id = setInterval(fetchStatus, 5000)
    return () => clearInterval(id)
  }, [fetchStatus, fetchMissions])

  const activeMissions = useMemo(
    () =>
      missions.filter(
        (m) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(m.status),
      ),
    [missions],
  )
  const recentMissions = useMemo(() => missions.slice(0, 5), [missions])

  return (
    <div className="relative p-6 lg:p-10 max-w-7xl mx-auto">
      {/* ============ Header ============ */}
      <header
        className={`flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between mb-8 ${
          mounted ? 'boot-in' : ''
        }`}
        style={{ animationDelay: '60ms' }}
      >
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary mb-1">
            · Supervision / Mission Control
          </p>
          <h1 className="text-3xl lg:text-[2rem] font-light leading-tight tracking-tight">
            Bonjour{' '}
            <span className="font-mono text-primary">
              {user?.name?.split(' ')[0] ?? 'opérateur'}
            </span>
            <span className="cursor-blink ml-1" aria-hidden />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Supervision en direct du robot{' '}
            <span className="font-mono text-foreground/80">{name}</span>.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          <span className="tabular-nums">{now}</span>
          <span className="size-1 rounded-full bg-muted-foreground/40" />
          <ConnectionBadge connected={connected} lastSync={lastSync} />
        </div>
      </header>

      {/* ============ Top row : robot hero + primary telemetry + actions ============ */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4 ${
          mounted ? 'boot-in' : ''
        }`}
        style={{ animationDelay: '160ms' }}
      >
        {/* Robot identity */}
        <section className="lg:col-span-4 relative rounded-sm border border-border bg-card/40 p-5 overflow-hidden">
          <CornerBrackets />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
                · Robot ID
              </p>
              <div className="font-mono text-xl text-foreground">
                RM3-PRO<span className="text-primary">.0x42</span>
              </div>
            </div>
            <StatusPill status={status} connected={connected} />
          </div>

          <pre
            className="mt-4 font-mono text-[10px] leading-[1.15] text-primary/80 select-none"
            aria-hidden
          >{` ╔═══╗
 ║ ◉ ◉ ║
 ╚═══╝
  ║║║
 ┌─┴─┐
 │▓▓▓│
 └───┘
  ◎ ◎`}</pre>

          <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-3 font-mono text-[11px]">
            <InfoLine label="Modèle" value="RM3-PRO" />
            <InfoLine label="Carte" value="Jetson Nano" />
            <InfoLine label="ROS" value="Humble" />
            <InfoLine label="Domain" value="30" />
          </div>
        </section>

        {/* Primary telemetry */}
        <section className="lg:col-span-5 relative rounded-sm border border-border bg-card/40 p-5 overflow-hidden">
          <CornerBrackets />
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              · Télémétrie
            </p>
            <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              <span
                className={`size-1 rounded-full ${
                  connected ? 'bg-emerald-500 status-pulse' : 'bg-muted-foreground'
                }`}
              />
              {connected ? 'Live' : 'Dernière lecture'}
            </span>
          </div>

          <div className="space-y-4">
            <TelemetryBig
              icon={batteryLevel < 20 ? BatteryLow : Battery}
              label="Batterie"
              value={batteryLevel}
              suffix="%"
              tone={batteryLevel < 20 ? 'err' : batteryLevel < 40 ? 'warn' : 'ok'}
              faded={!connected}
            />

            <div className="grid grid-cols-3 gap-3">
              <TelemetrySmall
                icon={MapPin}
                label="X"
                value={position.x.toFixed(2)}
                unit="m"
                faded={!connected}
              />
              <TelemetrySmall
                icon={MapPin}
                label="Y"
                value={position.y.toFixed(2)}
                unit="m"
                faded={!connected}
              />
              <TelemetrySmall
                icon={Compass}
                label="θ"
                value={((position.heading * 180) / Math.PI).toFixed(0)}
                unit="°"
                faded={!connected}
              />
            </div>

            {/* Carte 2D — position live du robot */}
            <div className="mt-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
                · Carte position
              </p>
              <RobotMap />
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section className="lg:col-span-3 flex flex-col gap-3">
          <Link
            to="/missions/new"
            className="group relative rounded-sm border border-primary/40 bg-primary/10 hover:bg-primary/20
                       p-5 transition-colors flex flex-col justify-between min-h-[120px] overflow-hidden"
          >
            <CornerBrackets color="primary" />
            <div className="relative">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary/80 mb-1">
                · Action
              </p>
              <p className="font-mono text-lg text-foreground">
                Nouvelle
                <br />
                mission
              </p>
            </div>
            <div className="relative flex items-center justify-between text-primary">
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Créer
              </span>
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>

          <Link
            to="/missions"
            className="group relative rounded-sm border border-border bg-card/40 hover:bg-card/70
                       p-5 transition-colors flex flex-col justify-between min-h-[120px] overflow-hidden"
          >
            <CornerBrackets />
            <div className="relative">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
                · Missions actives
              </p>
              <p className="font-mono text-3xl font-light tabular-nums text-foreground">
                {activeMissions.length}
                <span className="text-[14px] text-muted-foreground">
                  {' / '}
                  {total}
                </span>
              </p>
            </div>
            <div className="relative flex items-center justify-between text-foreground/70">
              <span className="font-mono text-[10px] uppercase tracking-widest">
                Voir tout
              </span>
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        </section>
      </div>

      {/* ============ System status grid ============ */}
      <section
        className={`grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 ${
          mounted ? 'boot-in' : ''
        }`}
        style={{ animationDelay: '280ms' }}
      >
        <SystemCard
          icon={Cpu}
          label="Moteurs"
          value={connected ? 'Prêt' : 'N/A'}
          tone={connected ? 'ok' : 'idle'}
        />
        <SystemCard
          icon={ScanLine}
          label="LiDAR"
          value={connected ? 'Actif' : 'N/A'}
          tone={connected ? 'ok' : 'idle'}
        />
        <SystemCard
          icon={Camera}
          label="Caméra"
          value={connected ? 'Veille' : 'N/A'}
          tone={connected ? 'warn' : 'idle'}
        />
        <SystemCard
          icon={Radio}
          label="MQTT"
          value="En attente"
          tone="idle"
          hint="Sprint 4"
        />
      </section>

      {/* ============ Bottom : missions + log ============ */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-5 gap-4 ${
          mounted ? 'boot-in' : ''
        }`}
        style={{ animationDelay: '400ms' }}
      >
        {/* Missions récentes */}
        <section className="lg:col-span-3 relative rounded-sm border border-border bg-card/40 overflow-hidden">
          <CornerBrackets />
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              · Missions récentes
            </p>
            <Link
              to="/missions"
              className="group flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-primary hover:text-primary/80"
            >
              Historique
              <ChevronRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {recentMissions.length === 0 ? (
            <div className="py-12 text-center">
              <Bot className="size-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="font-mono text-sm text-muted-foreground">
                Aucune mission enregistrée
              </p>
              <Link
                to="/missions/new"
                className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-primary hover:underline"
              >
                Créer la première <ArrowRight className="size-3" />
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recentMissions.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/missions/${m.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-card/70 transition-colors"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-8">
                      #{String(m.id).padStart(3, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {m.fromPoint?.name ?? `#${m.fromPointId}`}
                        <span className="mx-2 text-muted-foreground">→</span>
                        {m.toPoint?.name ?? `#${m.toPointId}`}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                        {m.type === 'TRANSPORT' ? 'Transport' : 'Pick & Place'}
                      </p>
                    </div>
                    <StatusBadge status={m.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Live log */}
        <section className="lg:col-span-2 relative rounded-sm border border-border bg-card/40 overflow-hidden">
          <CornerBrackets />
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              · Journal
            </p>
            <span
              className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest
                          ${connected ? 'text-emerald-400' : 'text-muted-foreground'}`}
            >
              <span
                className={`size-1 rounded-full ${
                  connected ? 'bg-emerald-500 status-pulse' : 'bg-muted-foreground'
                }`}
              />
              {connected ? 'Live' : 'Stale'}
            </span>
          </div>
          <LogStream connected={connected} error={error} status={status} />
        </section>
      </div>
    </div>
  )
}

/* ============================================================
   ConnectionBadge
   ============================================================ */
function ConnectionBadge({
  connected,
  lastSync,
}: {
  connected: boolean
  lastSync: number | null
}) {
  // tick chaque seconde pour que le compteur "Xs" avance tout seul
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border
                  ${
                    connected
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                      : 'border-destructive/30 bg-destructive/5 text-destructive'
                  }`}
    >
      {connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
      <span className="uppercase tracking-widest text-[9px]">
        {connected ? 'Connecté' : 'Hors-ligne'}
      </span>
      {connected && lastSync && (
        <span className="text-[9px] tabular-nums text-muted-foreground">
          · {Math.max(0, Math.floor((now - lastSync) / 1000))}s
        </span>
      )}
    </span>
  )
}

/* ============================================================
   StatusPill (robot status)
   ============================================================ */
function StatusPill({
  status,
  connected,
}: {
  status: RobotStatus
  connected: boolean
}) {
  const label = connected ? status : 'OFFLINE'
  const cfg = {
    AVAILABLE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    BUSY: 'border-primary/30 bg-primary/10 text-primary',
    OFFLINE: 'border-border bg-card/50 text-muted-foreground',
    ERROR: 'border-destructive/30 bg-destructive/10 text-destructive',
  }[label as RobotStatus]

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border font-mono text-[10px] uppercase tracking-widest ${cfg}`}
    >
      <span className="size-1.5 rounded-full bg-current status-pulse" />
      {label}
    </span>
  )
}

/* ============================================================
   TelemetryBig
   ============================================================ */
function TelemetryBig({
  icon: Icon,
  label,
  value,
  suffix,
  tone,
  faded,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  suffix: string
  tone: 'ok' | 'warn' | 'err'
  faded: boolean
}) {
  const color = {
    ok: 'bg-emerald-500',
    warn: 'bg-primary',
    err: 'bg-destructive',
  }[tone]
  const textColor = {
    ok: 'text-emerald-400',
    warn: 'text-primary',
    err: 'text-destructive',
  }[tone]

  return (
    <div className={`${faded ? 'opacity-40' : ''} transition-opacity`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className={`size-4 ${textColor}`} />
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
        </div>
        <span className="font-mono text-2xl tabular-nums text-foreground">
          {value.toFixed(0)}
          <span className="text-[14px] text-muted-foreground ml-0.5">{suffix}</span>
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-card overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  )
}

/* ============================================================
   TelemetrySmall (x/y/heading)
   ============================================================ */
function TelemetrySmall({
  icon: Icon,
  label,
  value,
  unit,
  faded,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  unit: string
  faded: boolean
}) {
  return (
    <div
      className={`rounded-sm border border-border bg-card/50 px-3 py-2 ${
        faded ? 'opacity-40' : ''
      } transition-opacity`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="size-3 text-muted-foreground" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="font-mono text-base tabular-nums text-foreground">
        {value}
        <span className="text-[10px] text-muted-foreground ml-0.5">{unit}</span>
      </p>
    </div>
  )
}

/* ============================================================
   SystemCard (moteurs/lidar/caméra/mqtt)
   ============================================================ */
function SystemCard({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone: 'ok' | 'warn' | 'err' | 'idle'
  hint?: string
}) {
  const color = {
    ok: 'text-emerald-400',
    warn: 'text-primary',
    err: 'text-destructive',
    idle: 'text-muted-foreground',
  }[tone]
  const dot = {
    ok: 'bg-emerald-500',
    warn: 'bg-primary',
    err: 'bg-destructive',
    idle: 'bg-muted-foreground/50',
  }[tone]

  return (
    <div className="relative rounded-sm border border-border bg-card/40 p-4 overflow-hidden">
      <CornerBrackets />
      <div className="relative flex items-start justify-between mb-3">
        <Icon className={`size-4 ${color}`} />
        <span className={`size-1.5 rounded-full ${dot} ${tone === 'ok' ? 'status-pulse' : ''}`} />
      </div>
      <p className="relative font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
        {label}
      </p>
      <p className={`relative font-mono text-sm font-medium ${color}`}>{value}</p>
      {hint && (
        <p className="relative font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60 mt-1">
          · {hint}
        </p>
      )}
    </div>
  )
}

/* ============================================================
   InfoLine (robot card)
   ============================================================ */
function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
        {label}
      </span>
      <span className="text-foreground/80">{value}</span>
    </div>
  )
}

/* ============================================================
   CornerBrackets — motif décoratif Mission Control
   ============================================================ */
function CornerBrackets({ color = 'muted' }: { color?: 'muted' | 'primary' }) {
  const cls =
    color === 'primary' ? 'border-primary/40' : 'border-muted-foreground/20'
  return (
    <>
      <span
        className={`pointer-events-none absolute top-0 left-0 size-2.5 border-t border-l ${cls}`}
        aria-hidden
      />
      <span
        className={`pointer-events-none absolute top-0 right-0 size-2.5 border-t border-r ${cls}`}
        aria-hidden
      />
      <span
        className={`pointer-events-none absolute bottom-0 left-0 size-2.5 border-b border-l ${cls}`}
        aria-hidden
      />
      <span
        className={`pointer-events-none absolute bottom-0 right-0 size-2.5 border-b border-r ${cls}`}
        aria-hidden
      />
    </>
  )
}

/* ============================================================
   LogStream — journal dynamique
   ============================================================ */
function LogStream({
  connected,
  error,
  status,
}: {
  connected: boolean
  error: string | null
  status: RobotStatus
}) {
  const lines = useMemo(() => {
    const base = [
      { t: tstamp(-8), k: 'INFO', c: 'text-muted-foreground', m: 'Boot dashboard OK' },
      {
        t: tstamp(-6),
        k: connected ? 'OK' : 'ERR',
        c: connected ? 'text-emerald-400' : 'text-destructive',
        m: connected
          ? 'API backend joignable'
          : error ?? 'API backend injoignable',
      },
    ]
    if (connected) {
      base.push({
        t: tstamp(-4),
        k: 'OK',
        c: 'text-emerald-400',
        m: `Robot status: ${status}`,
      })
    }
    base.push({
      t: tstamp(-2),
      k: 'WARN',
      c: 'text-primary',
      m: 'Bridge MQTT non branché (Sprint 4)',
    })
    return base
  }, [connected, error, status])

  const [visible, setVisible] = useState(0)
  const [now, setNow] = useState(() => clockShort())
  // reset l'animation quand le contenu du journal change — pattern React
  // "ajuster un state pendant le render" plutot qu'un effet
  const [prevLines, setPrevLines] = useState(lines)
  if (prevLines !== lines) {
    setPrevLines(lines)
    setVisible(0)
  }
  useEffect(() => {
    if (visible >= lines.length) return
    const id = setTimeout(() => setVisible((v) => v + 1), 180)
    return () => clearTimeout(id)
  }, [visible, lines.length])
  useEffect(() => {
    const id = setInterval(() => setNow(clockShort()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="p-4 font-mono text-[11px] leading-relaxed space-y-1 text-foreground/80 min-h-[180px]">
      {lines.slice(0, visible).map((l, i) => (
        <div key={i} className="flex gap-3 boot-in">
          <span className="text-muted-foreground/60 tabular-nums shrink-0">
            {l.t}
          </span>
          <span
            className={`${l.c} uppercase text-[10px] tracking-wider w-10 shrink-0`}
          >
            {l.k}
          </span>
          <span className="text-foreground/75 break-words min-w-0">{l.m}</span>
        </div>
      ))}
      {visible >= lines.length && (
        <div className="flex gap-3 text-primary">
          <span className="tabular-nums shrink-0">{now}</span>
          <span className="uppercase text-[10px] tracking-wider w-10 shrink-0">
            &gt;
          </span>
          <span className="cursor-blink" />
        </div>
      )}
      {!connected && (
        <div className="mt-3 inline-flex items-center gap-2 px-2 py-1 rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-[11px]">
          <AlertTriangle className="size-3" />
          Robot hors-ligne · tentative toutes les 5s
        </div>
      )}
    </div>
  )
}

/* ============================================================
   Helpers
   ============================================================ */
function pad(n: number) {
  return String(n).padStart(2, '0')
}
function fmtClock(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function clockShort() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function tstamp(deltaSec: number) {
  const d = new Date(Date.now() + deltaSec * 1000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
