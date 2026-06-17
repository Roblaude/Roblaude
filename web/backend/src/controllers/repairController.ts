import type { Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { runOnce } from '../services/sshConnection'
import { REPAIR_ACTIONS, repairCommand, type RepairAction } from '../lib/repairActions'

const repairSchema = z.object({
  action: z.enum(REPAIR_ACTIONS as unknown as [string, ...string[]]),
  confirm: z.boolean().optional(),
})

// Page Reparation (admin). getHealth = etat consolide du robot ; runRepair =
// declenche une action de reparation a partir d'un enum ferme (cf repairActions).

interface RobotStatusJson {
  myserial_ok: boolean
  agent: string
  m3pro: string
  yb_node: boolean
}

const STATUS_CMD = '/usr/local/bin/roblaude-robot-status.sh'

/** GET /api/admin/robots/:id/health */
export async function getHealth(req: Request, res: Response): Promise<void> {
  const robotId = Number(req.params.id)
  if (!Number.isInteger(robotId) || robotId <= 0) {
    res.status(400).json({ error: 'invalid robotId' })
    return
  }

  const robot = await prisma.robot
    .findUnique({ where: { id: robotId }, select: { battery: true } })
    .catch(() => null)

  let probe: RobotStatusJson | null = null
  let reachable = true
  try {
    const r = await runOnce(robotId, STATUS_CMD, 12_000)
    probe = JSON.parse(r.stdout.trim()) as RobotStatusJson
  } catch {
    reachable = false
  }

  res.json({
    reachable,
    stm32: probe ? (probe.myserial_ok ? 'ok' : 'down') : 'unknown',
    ybNode: probe ? (probe.yb_node ? 'ok' : 'down') : 'unknown',
    agent: probe ? (probe.agent === 'active' ? 'active' : 'dead') : 'unknown',
    m3pro: probe ? (probe.m3pro === 'up' ? 'up' : 'down') : 'unknown',
    battery: robot?.battery ?? null,
    ts: new Date().toISOString(),
  })
}

/** POST /api/admin/robots/:id/repair  body { action, confirm? } */
export async function runRepair(req: Request, res: Response): Promise<void> {
  const robotId = Number(req.params.id)
  if (!Number.isInteger(robotId) || robotId <= 0) {
    res.status(400).json({ error: 'invalid robotId' })
    return
  }
  const userId = req.user?.userId
  if (!userId) {
    res.status(401).json({ error: 'auth required' })
    return
  }

  const parsed = repairSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'unknown action', issues: parsed.error.issues })
    return
  }
  const action = parsed.data.action as RepairAction
  // le reboot coupe tout -> on exige une confirmation explicite
  if (action === 'reboot' && parsed.data.confirm !== true) {
    res.status(400).json({ error: 'reboot requires confirm:true' })
    return
  }

  // genere cote serveur (jamais le client) -> pas d'injection dans resync_clock
  const nowUtc = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const command = repairCommand(action, nowUtc)
  const startedAt = Date.now()

  try {
    const result = await runOnce(robotId, command, action === 'reboot' ? 5_000 : 20_000)
    const durationMs = Date.now() - startedAt
    await prisma.sshAuditLog
      .create({ data: { robotId, userId, mode: 'ALLOWLIST', command, exitCode: result.code, durationMs } })
      .catch((err) => console.error('[repair] audit echec :', err.message))
    res.json({ ok: result.code === 0, action, command, stdout: result.stdout, stderr: result.stderr, code: result.code })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    await prisma.sshAuditLog
      .create({ data: { robotId, userId, mode: 'ALLOWLIST', command, exitCode: -1, durationMs } })
      .catch(() => {})
    // le reboot coupe la connexion SSH : c'est attendu, on considere l'action lancee
    if (action === 'reboot') {
      res.json({ ok: true, action, command, note: 'reboot lancé (connexion coupée)' })
      return
    }
    res.status(502).json({ error: 'ssh failure', action, message: err instanceof Error ? err.message : 'ssh error' })
  }
}
