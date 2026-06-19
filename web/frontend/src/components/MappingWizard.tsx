import { useEffect, useRef, useState, useCallback } from 'react'
import {
  CheckCircle2, Circle, Loader2, Play, Square, Save, Navigation,
  ShieldCheck, Activity, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { useMappingStore } from '@/stores/mappingStore'
import { startMapping, stopMapping, saveMapping, startLocalization } from '@/lib/mappingApi'
import { getRobotHealth, type RobotHealth } from '@/lib/repairApi'

// Wizard cartographie & localisation — pour la soutenance : 4 etapes claires,
// chaque bouton envoie une commande au robot, un feed montre ce qui se passe.
//   1. Preparation  -> verifie que le robot est pret
//   2. Cartographie -> demarre l'exploration (SLAM), la carte grandit
//   3. Sauvegarde   -> fige la carte
//   4. Localisation -> le robot se repere sur la carte figee (sans la polluer)

type Level = 'info' | 'ok' | 'warn' | 'bad'
interface FeedItem { t: string; level: Level; text: string }

const STEPS = [
  { n: 1, label: 'Préparation', icon: ShieldCheck },
  { n: 2, label: 'Cartographie', icon: Play },
  { n: 3, label: 'Sauvegarde', icon: Save },
  { n: 4, label: 'Localisation', icon: Navigation },
] as const

const levelColor: Record<Level, string> = {
  info: 'text-gray-400', ok: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400',
}

export function MappingWizard({ robotId }: { robotId: number }) {
  const { state, sessionId, mapMeta, wsConnected, failureReason, coveragePercent } = useMappingStore()
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [health, setHealth] = useState<RobotHealth | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const prevState = useRef<string>(state)

  const log = useCallback((level: Level, text: string): void => {
    const t = new Date().toLocaleTimeString()
    setFeed((f) => [{ t, level, text }, ...f].slice(0, 40))
  }, [])

  // feed automatique sur les transitions d'etat du robot (le "retour live")
  useEffect(() => {
    if (state === prevState.current) return
    prevState.current = state
    const map: Record<string, [Level, string]> = {
      STARTING: ['info', 'Robot : démarrage de la stack…'],
      RUNNING: ['ok', 'Robot : cartographie EN COURS — la carte se construit'],
      STOPPING: ['info', 'Robot : arrêt en cours…'],
      STOPPED: ['ok', 'Robot : arrêté'],
      FAILED: ['bad', `Robot : ÉCHEC${failureReason ? ` — ${failureReason}` : ''}`],
    }
    const entry = map[state]
    if (entry) log(entry[0], entry[1])
    if (state === 'RUNNING' && step < 2) setStep(2)
  }, [state, failureReason, log, step])

  // santé en continu mais LÉGER : toutes les 15s, et PAS pendant le mapping.
  // La sonde lance des ros2 CLI dans le container -> sur le Nano (CPU faible)
  // on ne veut surtout pas la lancer pendant que SLAM/Nav2 tournent.
  useEffect(() => {
    let alive = true
    const tick = async (): Promise<void> => {
      const st = useMappingStore.getState().state
      if (st === 'STARTING' || st === 'RUNNING') return  // robot occupe -> on ne sonde pas
      try { const h = await getRobotHealth(robotId); if (alive) setHealth(h) }
      catch { if (alive) setHealth(null) }
    }
    void tick()
    const id = setInterval(() => void tick(), 15000)
    return () => { alive = false; clearInterval(id) }
  }, [robotId])

  const run = useCallback(async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(key)
    try { await fn() } finally { setBusy(null) }
  }, [])

  const doPrep = (): Promise<void> => run('prep', async () => {
    log('info', 'Vérification du robot…')
    try {
      const h = await getRobotHealth(robotId)
      setHealth(h)
      // detail : chaque sous-systeme. On dit precisement ce qui n'est pas pret.
      const checks: [string, boolean][] = [
        ['connexion', h.reachable],
        ['container ROS', h.m3pro === 'up'],
        ['STM32', h.stm32 === 'ok'],
        ['agent micro-ROS', h.agent === 'active'],
        ['driver YB_Node', h.ybNode === 'ok'],
        ['batterie ≥30%', (h.battery ?? 0) >= 30],
      ]
      const notReady = checks.filter(([, ok]) => !ok).map(([n]) => n)
      if (notReady.length === 0) { log('ok', 'Tout est prêt ✓ — on peut cartographier'); setStep(2) }
      else log('warn', `Pas prêt : ${notReady.join(' · ')}`)
    } catch (e) {
      log('bad', `Robot injoignable — ${e instanceof Error ? e.message : 'erreur'}`)
    }
  })

  // re-verif manuelle (sonde ponctuelle) — dispo meme pendant le mapping, pour
  // checker a la demande si ca bloque/sature. Ne change pas d'etape.
  const refreshHealth = (): Promise<void> => run('health', async () => {
    try { const h = await getRobotHealth(robotId); setHealth(h); log('ok', 'État rafraîchi') }
    catch { setHealth(null); log('bad', 'Robot injoignable') }
  })

  const doStart = (): Promise<void> => run('start', async () => {
    log('info', 'Commande envoyée : démarrer la cartographie')
    try { const r = await startMapping(robotId); log('ok', `Session #${r.sessionId} créée`); setStep(2) }
    catch (e) { log('bad', `Échec start — ${e instanceof Error ? e.message : 'erreur'}`) }
  })

  const doStop = (): Promise<void> => run('stop', async () => {
    if (!sessionId) return
    log('info', 'Commande envoyée : arrêter la cartographie')
    try { await stopMapping(sessionId); log('ok', 'Arrêt demandé'); setStep(3) }
    catch (e) { log('bad', `Échec stop — ${e instanceof Error ? e.message : 'erreur'}`) }
  })

  const doSave = (): Promise<void> => run('save', async () => {
    if (!sessionId) { log('warn', 'Pas de session à sauvegarder'); return }
    log('info', 'Commande envoyée : sauvegarder la carte…')
    try { const r = await saveMapping(sessionId); log('ok', `Carte sauvegardée (snapshot #${r.snapshotId})`); toast.success('Carte sauvegardée'); setStep(4) }
    catch (e) { log('bad', `Échec save — ${e instanceof Error ? e.message : 'erreur'}`) }
  })

  const doLocalize = (): Promise<void> => run('localize', async () => {
    log('info', 'Commande envoyée : passer en localisation (AMCL sur carte figée)')
    try { await startLocalization(robotId); log('ok', 'Localisation lancée — le robot se repère sur la carte (sans la modifier)'); toast.success('Mode localisation') }
    catch (e) { log('bad', `Échec localisation — ${e instanceof Error ? e.message : 'erreur'}`) }
  })

  const mapping = state === 'STARTING' || state === 'RUNNING'

  return (
    <div className="space-y-4">
      {/* etat robot LIVE — toujours visible (on voit que tout est bon, auto-refresh 5s) */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" /> État du robot
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className={`size-1.5 rounded-full ${mapping ? 'bg-amber-400' : health ? 'bg-emerald-400' : 'bg-gray-600'}`} />
            {mapping ? 'figé (mapping)' : health ? 'live · 15s' : 'en attente…'}
            <button onClick={refreshHealth} disabled={busy === 'health'}
              className="ml-1 text-gray-400 hover:text-white disabled:opacity-50" aria-label="Re-vérifier maintenant" title="Re-vérifier maintenant">
              {busy === 'health' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </button>
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {([
            ['Connexion', health?.reachable ? 'ok' : 'bad', health ? (health.reachable ? 'en ligne' : 'injoignable') : '…'],
            ['Container ROS', health?.m3pro === 'up' ? 'ok' : 'bad', health?.m3pro ?? '…'],
            ['STM32', health?.stm32 === 'ok' ? 'ok' : 'bad', health?.stm32 ?? '…'],
            ['Agent micro-ROS', health?.agent === 'active' ? 'ok' : 'bad', health?.agent ?? '…'],
            ['Driver YB_Node', health?.ybNode === 'ok' ? 'ok' : 'bad', health?.ybNode ?? '…'],
            ['Batterie', (health?.battery ?? 0) >= 30 ? 'ok' : 'warn', health?.battery == null ? '…' : `${health.battery}%`],
          ] as [string, Level, string][]).map(([label, lvl, val]) => (
            <div key={label} className="rounded border border-gray-800 bg-gray-950 p-2">
              <div className="text-gray-500">{label}</div>
              <div className={`font-medium ${levelColor[lvl]}`}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* stepper vertical — tout visible dans la colonne, pas de debordement */}
      <div className="flex flex-col gap-1.5">
        {STEPS.map((s) => {
          const done = step > s.n
          const active = step === s.n
          const Icon = done ? CheckCircle2 : active ? s.icon : Circle
          return (
            <button
              key={s.n}
              onClick={() => setStep(s.n)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border w-full text-left transition ${
                active ? 'border-cyan-500 bg-cyan-950/40 text-white'
                : done ? 'border-emerald-700 bg-emerald-950/20 text-emerald-300'
                : 'border-gray-800 bg-gray-900 text-gray-500'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-cyan-400' : done ? 'text-emerald-400' : ''}`} />
              <span className="text-sm font-medium">{s.n}. {s.label}</span>
              {done && <span className="ml-auto text-[10px] text-emerald-400">fait</span>}
              {active && <span className="ml-auto text-[10px] text-cyan-400">en cours</span>}
            </button>
          )
        })}
      </div>

      {/* carte de l'etape courante */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">On vérifie que le robot est prêt avant de cartographier. Les indicateurs « État du robot » se rafraîchissent toutes les 15 s (en pause pendant le mapping pour ne pas charger le robot) — bouton ⟳ pour forcer.</p>
            <button onClick={doPrep} disabled={busy !== null}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded font-medium">
              {busy === 'prep' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Vérifier le robot
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              Le robot explore tout seul et construit la carte. Tu peux le piloter au clavier si besoin.
              {coveragePercent != null && <span className="text-cyan-400"> · couverture ~{Math.round(coveragePercent)}%</span>}
            </p>
            <div className="flex gap-2">
              <button onClick={doStart} disabled={busy !== null || mapping}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium">
                {busy === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Démarrer la cartographie
              </button>
              <button onClick={doStop} disabled={busy !== null || !mapping}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded font-medium">
                {busy === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                Arrêter
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">Quand la pièce est bien couverte, on fige la carte.</p>
            <button onClick={doSave} disabled={busy !== null}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-medium">
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Sauvegarder la carte
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              Mode usage : le robot se repère sur la carte figée. On peut le déplacer / l'éteindre,
              il retrouve sa position — <span className="text-emerald-400">sans jamais polluer la carte</span>.
            </p>
            <button onClick={doLocalize} disabled={busy !== null}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded font-medium">
              {busy === 'localize' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              Passer en localisation
            </button>
          </div>
        )}
      </div>

      {/* feed live : ce qui se passe */}
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-gray-400 mb-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" /> Ce qui se passe
          <span className={`ml-auto flex items-center gap-1 ${wsConnected ? 'text-emerald-400' : 'text-gray-500'}`}>
            <span className={`size-1.5 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-gray-600'}`} />
            {wsConnected ? 'live' : 'hors ligne'}
          </span>
        </div>
        <div className="bg-gray-950 border border-gray-800 rounded-lg h-40 overflow-y-auto divide-y divide-gray-900 text-xs font-mono">
          {feed.length === 0 ? (
            <div className="p-3 text-gray-600">En attente d'une action…</div>
          ) : feed.map((f, i) => (
            <div key={i} className="px-3 py-1.5 flex gap-2">
              <span className="text-gray-600 shrink-0">{f.t}</span>
              <span className={levelColor[f.level]}>{f.text}</span>
            </div>
          ))}
        </div>
        {failureReason && (
          <div className="mt-2 flex items-start gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900 rounded p-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {failureReason}
          </div>
        )}
      </div>

      {mapMeta && (
        <div className="text-[10px] text-gray-600 text-center">
          carte {mapMeta.width}×{mapMeta.height}px · {mapMeta.resolution.toFixed(3)} m/px
        </div>
      )}
    </div>
  )
}
