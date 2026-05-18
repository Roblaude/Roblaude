import { useEffect, useState } from "react"

/**
 * MissionControlPanel — panneau droit des pages d'auth.
 * Simule un moniteur de supervision robot : status, telemetry, timeline live.
 */
export function MissionControlPanel() {
  const now = useClock()
  const battery = useFakeRange(87, 89)
  const voltage = useFakeRange(124, 126, 1)
  const signal = useFakeRange(72, 78)

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          · Mission Control / Supervision
        </div>
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {now}
        </div>
      </header>

      <div className="flex-1 grid grid-rows-[auto_1fr_auto] gap-6 p-6 lg:p-8">
        {/* ============ Status block ============ */}
        <section className="grid grid-cols-2 gap-3">
          <StatusCard label="Moteurs" value="PRÊT" state="ok" />
          <StatusCard label="LiDAR" value="ACTIF" state="ok" />
          <StatusCard label="Caméra" value="VEILLE" state="idle" />
          <StatusCard label="MQTT" value="LIÉ" state="ok" />
        </section>

        {/* ============ Robot identity + hero ============ */}
        <section className="flex flex-col justify-center gap-8 py-6">
          <div className="grid grid-cols-[auto_1fr] gap-6 items-center">
            {/* ASCII robot icon */}
            <pre
              className="font-mono text-[10px] leading-[1.15] text-primary/80 select-none"
              aria-hidden
            >{` ╔═══╗
 ║ ◉ ◉ ║
 ╚═══╝
  ║║║
 ┌─┴─┐
 │▓▓▓│
 └───┘
  ◎ ◎`}</pre>

            <div className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Robot ID
              </div>
              <div className="font-mono text-xl text-foreground">
                RM3-PRO<span className="text-primary">.0x42</span>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground/80">
                ROSMASTER M3 PRO · Jetson Nano B01
              </div>
              <div className="font-mono text-[11px] text-muted-foreground/60">
                ROS 2 Humble · DOMAIN_ID=30
              </div>
            </div>
          </div>

          {/* Telemetry bars */}
          <div className="space-y-3">
            <TelemetryBar label="Batterie" value={battery} suffix="%" tone="ok" />
            <TelemetryBar label="Tension" value={voltage / 10} suffix="V" tone="ok" decimals={1} />
            <TelemetryBar label="Signal Wi-Fi" value={signal} suffix="%" tone="warn" />
          </div>
        </section>

        {/* ============ Live log ============ */}
        <section className="rounded-sm border border-border bg-card/40 p-4 font-mono text-[11px] leading-relaxed">
          <div className="flex items-center justify-between mb-2 text-muted-foreground">
            <span className="uppercase tracking-widest text-[9px]">· Journal système</span>
            <span className="inline-flex items-center gap-1.5 text-[9px]">
              <span className="size-1 rounded-full bg-emerald-500 status-pulse" />
              LIVE
            </span>
          </div>
          <LogStream />
        </section>
      </div>
    </div>
  )
}

/* ============================================================
   StatusCard
   ============================================================ */
function StatusCard({
  label,
  value,
  state,
}: {
  label: string
  value: string
  state: "ok" | "idle" | "err"
}) {
  const colors = {
    ok: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    idle: "text-muted-foreground border-border bg-card/50",
    err: "text-destructive border-destructive/20 bg-destructive/5",
  }[state]
  const dot = {
    ok: "bg-emerald-500",
    idle: "bg-muted-foreground/50",
    err: "bg-destructive",
  }[state]
  return (
    <div className={`rounded-sm border px-3 py-2.5 ${colors}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <span className={`size-1.5 rounded-full ${dot} ${state === "ok" ? "status-pulse" : ""}`} />
      </div>
      <div className="mt-1 font-mono text-sm font-medium">{value}</div>
    </div>
  )
}

/* ============================================================
   TelemetryBar
   ============================================================ */
function TelemetryBar({
  label,
  value,
  suffix,
  tone,
  decimals = 0,
}: {
  label: string
  value: number
  suffix: string
  tone: "ok" | "warn" | "err"
  decimals?: number
}) {
  const color = {
    ok: "bg-emerald-500",
    warn: "bg-primary",
    err: "bg-destructive",
  }[tone]
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between font-mono text-[11px]">
        <span className="uppercase tracking-widest text-muted-foreground text-[10px]">
          {label}
        </span>
        <span className="tabular-nums text-foreground">
          {value.toFixed(decimals)}
          <span className="text-muted-foreground">{suffix}</span>
        </span>
      </div>
      <div className="relative h-1 rounded-full bg-card overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${color} transition-all duration-500`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  )
}

/* ============================================================
   LogStream — lignes qui s'affichent progressivement
   ============================================================ */
function LogStream() {
  const base = [
    { t: "14:33:02", k: "INFO", c: "text-muted-foreground", m: "Boot sequence complete" },
    { t: "14:33:03", k: "OK", c: "text-emerald-400", m: "micro-ros-agent connected on /dev/myserial" },
    { t: "14:33:04", k: "OK", c: "text-emerald-400", m: "LiDAR YDLidar calibré (scan 360°)" },
    { t: "14:33:05", k: "INFO", c: "text-muted-foreground", m: "Bras 6 DOF en position home" },
    { t: "14:33:06", k: "WARN", c: "text-primary", m: "Caméra Astra Pro en veille (économie batterie)" },
    { t: "14:33:07", k: "OK", c: "text-emerald-400", m: "System ready. Awaiting operator." },
  ]
  const [visible, setVisible] = useState(0)
  const liveClock = useClockShort() // doit etre appele inconditionnellement
  useEffect(() => {
    if (visible >= base.length) return
    const id = setTimeout(() => setVisible((v) => v + 1), 220)
    return () => clearTimeout(id)
  }, [visible, base.length])

  return (
    <div className="space-y-1 text-foreground/80">
      {base.slice(0, visible).map((l, i) => (
        <div key={i} className="flex gap-3 boot-in">
          <span className="text-muted-foreground/60 tabular-nums">{l.t}</span>
          <span className={`${l.c} uppercase text-[10px] tracking-wider w-10`}>
            {l.k}
          </span>
          <span className="text-foreground/75">{l.m}</span>
        </div>
      ))}
      {visible >= base.length && (
        <div className="flex gap-3 text-primary">
          <span className="tabular-nums">{liveClock}</span>
          <span className="uppercase text-[10px] tracking-wider w-10">&gt;</span>
          <span className="cursor-blink" />
        </div>
      )}
    </div>
  )
}

/* ============================================================
   Hooks utilitaires
   ============================================================ */
function useClock() {
  const [t, setT] = useState(() => fmtClock(new Date()))
  useEffect(() => {
    const id = setInterval(() => setT(fmtClock(new Date())), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

function useClockShort() {
  const [t, setT] = useState(() => {
    const d = new Date()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  })
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setT(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
    }, 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

function fmtClock(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function useFakeRange(min: number, max: number, factor = 1) {
  const [v, setV] = useState(() => rand(min, max) * factor)
  useEffect(() => {
    const id = setInterval(() => setV(rand(min, max) * factor), 2400)
    return () => clearInterval(id)
  }, [min, max, factor])
  return v
}

function rand(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1))
}
