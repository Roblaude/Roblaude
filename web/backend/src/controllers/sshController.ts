import type { Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { runOnce } from '../services/sshConnection'
import { isAllowlistedCommand } from '../lib/sshAllowlist'

// Exec SSH en mode ALLOWLIST uniquement (T3.5.12). Le mode ELEVATED (cmd libre
// avec re-auth) est explicitement hors scope demo — voir docs/spec §5.5.

const execSchema = z.object({
  robotId: z.number().int().positive(),
  command: z.string().min(1).max(200),
})

const logsSchema = z.object({
  unit: z.string().regex(/^[\w.-]+$/).optional(),
  lines: z.coerce.number().int().min(1).max(500).default(100),
})

export async function execAllowlist(req: Request, res: Response): Promise<void> {
  const parsed = execSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'invalid body', issues: parsed.error.issues }); return }
  const { robotId, command } = parsed.data
  const userId = req.user?.userId
  if (!userId) { res.status(401).json({ error: 'auth required' }); return }

  if (!isAllowlistedCommand(command)) {
    await prisma.sshAuditLog.create({
      data: { robotId, userId, mode: 'ALLOWLIST', command, exitCode: -1, durationMs: 0 },
    }).catch(() => {})
    res.status(403).json({ error: 'command not allowed', command })
    return
  }

  const startedAt = Date.now()
  try {
    const result = await runOnce(robotId, command, 10_000)
    const durationMs = Date.now() - startedAt
    await prisma.sshAuditLog.create({
      data: { robotId, userId, mode: 'ALLOWLIST', command, exitCode: result.code, durationMs },
    }).catch((err) => console.error('[ssh] audit log echec :', err.message))
    res.json(result)
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const message = err instanceof Error ? err.message : 'ssh error'
    await prisma.sshAuditLog.create({
      data: { robotId, userId, mode: 'ALLOWLIST', command, exitCode: -1, durationMs },
    }).catch(() => {})
    res.status(502).json({ error: 'ssh failure', message })
  }
}

/** GET /api/admin/robots/:id/logs — wrapper SSH journalctl, MVP demo. */
export async function readLogs(req: Request, res: Response): Promise<void> {
  const robotId = Number(req.params.id)
  if (!Number.isInteger(robotId) || robotId <= 0) {
    res.status(400).json({ error: 'invalid robotId' })
    return
  }
  const parsed = logsSchema.safeParse(req.query)
  if (!parsed.success) { res.status(400).json({ error: 'invalid query' }); return }
  const { unit, lines } = parsed.data
  const cmd = unit
    ? `journalctl --no-pager -n ${lines} -u ${unit}`
    : `journalctl --no-pager -n ${lines}`
  // securite : on passe par l'allowlist meme si on construit la commande.
  if (!isAllowlistedCommand(cmd)) {
    res.status(403).json({ error: 'logs command rejected by allowlist' })
    return
  }
  try {
    const result = await runOnce(robotId, cmd, 10_000)
    res.json({ command: cmd, stdout: result.stdout, exitCode: result.code })
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'ssh error' })
  }
}

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const robotId = Number(req.query.robotId)
  const take = Math.min(200, Number(req.query.take ?? 50))
  const where = Number.isInteger(robotId) && robotId > 0 ? { robotId } : {}
  const logs = await prisma.sshAuditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  res.json(logs)
}
