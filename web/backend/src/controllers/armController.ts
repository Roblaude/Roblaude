import type { Request, Response } from 'express'
import { z } from 'zod'
import { robotMqtt } from '../services/mqtt'

// POST /api/robots/:id/arm — commande directe du bras 6-DOF (5 axes + pince).
// Publie sur MQTT roblaude/{id}/cmd/arm, le mqtt_bridge.py cote robot
// transforme en arm_msgs/ArmJoints et l'envoie a YB_Node -> servos.
//
// Limites cote backend (double securite avec celles du robot) :
//  joint1..6 : int16, on accepte -180..180 (clamp dur robot a -180/180)
//  time      : 50..5000 ms (mouvement instantane = casser les servos)

const ARM_MIN = -180
const ARM_MAX = 180
const TIME_MIN = 50
const TIME_MAX = 5000

const armSchema = z.object({
  joint1: z.number().int().gte(ARM_MIN).lte(ARM_MAX),
  joint2: z.number().int().gte(ARM_MIN).lte(ARM_MAX),
  joint3: z.number().int().gte(ARM_MIN).lte(ARM_MAX),
  joint4: z.number().int().gte(ARM_MIN).lte(ARM_MAX),
  joint5: z.number().int().gte(ARM_MIN).lte(ARM_MAX),
  joint6: z.number().int().gte(ARM_MIN).lte(ARM_MAX),
  time: z.number().int().gte(TIME_MIN).lte(TIME_MAX).default(500),
})

export async function commandArm(req: Request, res: Response): Promise<void> {
  const robotId = Number(req.params.id)
  if (!Number.isInteger(robotId) || robotId <= 0) {
    res.status(400).json({ error: 'invalid robotId' })
    return
  }
  const parsed = armSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid body', issues: parsed.error.issues })
    return
  }
  const ok = robotMqtt.publishCommand(robotId, 'arm', parsed.data)
  if (!ok) {
    res.status(503).json({ error: 'mqtt not connected' })
    return
  }
  // 202 Accepted — le mouvement reel prendra `time` ms cote robot
  res.status(202).json({ ok: true, sent: parsed.data })
}
