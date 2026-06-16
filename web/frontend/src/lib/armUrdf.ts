import type { ArmCommand } from './armApi'

// Mapping pose commandee (degres Yahboom) -> joints du modele URDF (radians).
// Sert au "miroir" : le M3 Pro est open-loop (/joint_states=0), donc le viewer 3D
// suit la derniere commande envoyee au lieu d'un feedback inexistant.

// noms reels des joints dans l'URDF Yahboom — arm4 a une typo "Joiint" cote source, on la garde
export const ARM_JOINT_MAP: Record<string, string> = {
  joint1: 'arm1_Joint',
  joint2: 'arm2_Joint',
  joint3: 'arm3_Joint',
  joint4: 'arm4_Joiint',
  joint5: 'arm5_Joint',
}

type ArmPoseDeg = Pick<ArmCommand, 'joint1' | 'joint2' | 'joint3' | 'joint4' | 'joint5'>

// convention Yahboom : servo 0..180, 90 = neutre. URDF en radians, 0 = neutre.
export function servoDegToUrdfRad(deg: number): number {
  return ((deg - 90) * Math.PI) / 180
}

// pose (degres) -> { nomJointUrdf: radians }. joint6 (pince) non mappe :
// la pince URDF est a 2 doigts (rlink/llink), pas un joint unique.
export function armPoseToUrdfJoints(pose: ArmPoseDeg): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, urdfName] of Object.entries(ARM_JOINT_MAP)) {
    const deg = pose[key as keyof ArmPoseDeg]
    if (typeof deg === 'number') out[urdfName] = servoDegToUrdfRad(deg)
  }
  return out
}
