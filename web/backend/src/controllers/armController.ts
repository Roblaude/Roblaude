import type { Request, Response } from 'express'
import { z } from 'zod'
import { robotMqtt } from '../services/mqtt'

// POST /api/robots/:id/arm — commande directe du bras 6-DOF (5 axes + pince).
// Publie sur MQTT roblaude/{id}/cmd/arm, le mqtt_bridge.py cote robot
// transforme en arm_msgs/ArmJoints et l'envoie a YB_Node -> servos.
//
// CONVENTION OFFICIELLE YAHBOOM M3 PRO (servos numeriques STM32) :
//   joint1 : base yaw       (0 = gauche, 90 = face avant, 180 = droite)
//   joint2 : epaule pitch   (0 = vertical haut, 90 = 45°, 180 = horizontal)
//   joint3 : coude          (0 = tendu, 90 = 90° plie, 180 = replie a fond)
//   joint4 : poignet pitch  (0 = en bas, 90 = neutre, 180 = en haut)
//   joint5 : poignet roulis (rotation)
//   joint6 : gripper        (0 = ferme, 180 = ouvert max)
//   time   : duree en ms    (500..5000, < 500 = saccade, > 5000 = bloque)
//
// HOME officielle : [90, 120, 10, 20, 90, 0] time=2000.

const ARM_MIN = 0
const ARM_MAX = 180
const TIME_MIN = 500
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

// Poses officielles Yahboom M3 Pro. Source : doc constructeur fournie
// par l'utilisateur (cf. commit msg PR #256). Convention 0..180, gripper
// ferme = 0, ouvert max = 180.

export const ARM_PRESETS = {
  // HOME officielle Yahboom — pose recommandee au repos / debut+fin de session.
  // Servos chauffent moins en position depliee, c'est la safe spot du M3 Pro.
  startup: { joint1: 90, joint2: 120, joint3: 10, joint4: 20, joint5: 90, joint6: 0, time: 2000 },
  // Shutdown = HOME aussi (idem pose de repos)
  shutdown: { joint1: 90, joint2: 120, joint3: 10, joint4: 20, joint5: 90, joint6: 0, time: 2000 },
  // Salut : bras leve, gripper ferme (gesture demo).
  salut: { joint1: 90, joint2: 60, joint3: 30, joint4: 60, joint5: 90, joint6: 0, time: 2000 },
  // Vertical pur : joint2=0 = bras pointant vers le haut.
  vertical: { joint1: 90, joint2: 0, joint3: 0, joint4: 90, joint5: 90, joint6: 0, time: 2000 },
  // Gripper teste : ouvre la pince au max.
  gripperOpen: { joint1: 90, joint2: 120, joint3: 10, joint4: 20, joint5: 90, joint6: 180, time: 1500 },
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
