import { apiFetch } from './api'

export interface SshAuditEntry {
  id: number
  robotId: number
  userId: number
  user: { id: number; name: string; email: string } | null
  mode: 'ALLOWLIST' | 'ELEVATED'
  command: string
  exitCode: number | null
  durationMs: number | null
  createdAt: string
}

export async function fetchSshAudit(robotId?: number, take = 50): Promise<SshAuditEntry[]> {
  const params = new URLSearchParams()
  if (robotId) params.set('robotId', String(robotId))
  params.set('take', String(take))
  const res = await apiFetch(`/admin/ssh/audit?${params}`)
  if (!res.ok) throw new Error(`fetchSshAudit ${res.status}`)
  return res.json()
}

export async function fetchRobotLogs(
  robotId: number,
  opts: { unit?: string; lines?: number } = {},
): Promise<{ command: string; stdout: string; exitCode: number }> {
  const params = new URLSearchParams()
  if (opts.unit) params.set('unit', opts.unit)
  if (opts.lines) params.set('lines', String(opts.lines))
  const res = await apiFetch(`/admin/ssh/robots/${robotId}/logs?${params}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `fetchRobotLogs ${res.status}`)
  }
  return res.json()
}

export async function execSsh(
  robotId: number,
  command: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const res = await apiFetch('/admin/ssh/exec', {
    method: 'POST',
    body: JSON.stringify({ robotId, command }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `execSsh ${res.status}`)
  }
  return res.json()
}
