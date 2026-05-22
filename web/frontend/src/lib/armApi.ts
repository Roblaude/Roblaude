import { apiFetch } from './api'

export interface ArmCommand {
  joint1: number
  joint2: number
  joint3: number
  joint4: number
  joint5: number
  joint6: number  // pince
  time?: number   // ms, default 500
}

export async function commandArm(robotId: number, cmd: ArmCommand): Promise<void> {
  const res = await apiFetch(`/robots/${robotId}/arm`, {
    method: 'POST',
    body: JSON.stringify(cmd),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `commandArm ${res.status}`)
  }
}
