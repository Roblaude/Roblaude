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

// Poses predefinies calibrees par rapport au repere physique
// "bras vertical pointant vers le haut" (cf. spec arm-control-design).
// L'utilisateur peut ajuster ces valeurs par essai/erreur ; idealement
// elles vivront dans un fichier de config robot un jour.
//
// Convention Yahboom M3 Pro (apres calibration physique):
//   joint1 : base yaw   (0 = face avant robot)
//   joint2 : epaule pitch (negatif = vers le haut, positif = vers le bas)
//   joint3 : coude pitch (0 = bras tendu, positif = replie vers le haut)
//   joint4 : poignet pitch (0 = aligne, positif = baisse)
//   joint5 : poignet yaw (rotation finale)
//   joint6 : pince (0 = ouverte, 180 = fermee)

export const ARM_PRESETS = {
  // Position quand le robot s'allume : bras pret a travailler,
  // legerement plie vers l'avant, pince mi-ouverte.
  startup: { joint1: 0, joint2: -30, joint3: 60, joint4: 30, joint5: 0, joint6: 90, time: 1500 },
  // Position avant extinction : bras replie sur lui-meme contre le corps,
  // pince fermee. Evite que le bras tombe / traine au sol au shutdown.
  shutdown: { joint1: 0, joint2: 80, joint3: -80, joint4: 0, joint5: 0, joint6: 180, time: 1500 },
  // Reference de calibration : bras tout droit vertical.
  vertical: { joint1: 0, joint2: -90, joint3: 0, joint4: 0, joint5: 0, joint6: 90, time: 2000 },
} as const

type PresetName = keyof typeof ARM_PRESETS

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
  res.status(202).json({ ok: true, sent: parsed.data })
}

export async function commandArmPreset(req: Request, res: Response): Promise<void> {
  const robotId = Number(req.params.id)
  if (!Number.isInteger(robotId) || robotId <= 0) {
    res.status(400).json({ error: 'invalid robotId' })
    return
  }
  const presetName = req.params.preset as PresetName
  const preset = ARM_PRESETS[presetName]
  if (!preset) {
    res.status(400).json({ error: 'unknown preset', available: Object.keys(ARM_PRESETS) })
    return
  }
  const ok = robotMqtt.publishCommand(robotId, 'arm', preset)
  if (!ok) {
    res.status(503).json({ error: 'mqtt not connected' })
    return
  }
  res.status(202).json({ ok: true, preset: presetName, sent: preset })
}

export function listArmPresets(_req: Request, res: Response): void {
  res.json(ARM_PRESETS)
}
