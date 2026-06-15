"""Cinematique inverse du bras Yahboom M3 PRO — fonctions pures, testables.

Porte de la stack vision du prof (pick_and_place_node) sur nos conventions.
Aucune dependance ROS ici : que des maths, pour pouvoir tester en pytest sans
robot. Le node qui pilote le bras (mission_executor) appelle ces fonctions puis
publie des arm_msgs/ArmJoints sur /arm6_joints.

Convention servo Yahboom : tous les joints 0..180 deg, 90 = centre.
"""
import math
from dataclasses import dataclass


@dataclass
class ArmGeometry:
    """Dimensions du bras (metres) lues sur l'URDF Yahboom M3 PRO.

    Valeurs par defaut = celles mesurees par le prof. Surchargeables par
    parametre ROS cote node.
    """
    base_x: float = 0.02      # offset du pied du bras / base_link
    base_z: float = 0.24      # hauteur de l'epaule au-dessus de base_link
    l1: float = 0.11          # bras (epaule -> coude)
    l2: float = 0.11          # avant-bras (coude -> poignet)
    l3: float = 0.12          # poignet + pince jusqu'au bout des doigts
    joint_limit: float = 1.57  # limite articulaire +-rad (~90 deg)


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def rad_to_servo(rad: float, center: float = 90.0) -> float:
    """Radians (0 = centre) -> degres servo Yahboom (90 = centre), clampe 0..180."""
    return clamp(math.degrees(rad) + center, 0.0, 180.0)


def compute_ik(tx: float, ty: float, tz: float, geom: ArmGeometry = None):
    """IK analytique pour le bras M3 PRO.

    Cible (tx, ty, tz) dans le repere base_link. Le bras a : base_yaw (Z),
    epaule (Y), coude (Y), wrist_pitch (Y), wrist_roll (X). On resout un IK
    planaire 2-segments pour epaule+coude, puis on oriente le poignet pour
    pointer la pince vers le bas.

    Renvoie (base_yaw, epaule, coude, wrist_pitch, wrist_roll) en radians, ou
    None si la cible est hors de portee ou viole une limite articulaire.
    """
    if geom is None:
        geom = ArmGeometry()

    # Position relative au pied du bras
    dx = tx - geom.base_x
    dy = ty
    dz = tz - geom.base_z  # relatif a la hauteur d'epaule

    # Rotation de la base
    base_yaw = math.atan2(dy, dx)

    # Distance horizontale dans le plan du bras
    r = math.sqrt(dx ** 2 + dy ** 2)

    # On veut la pince vers le bas : le poignet vise (r, dz), la pince descend
    # de l3 sous ce point. Cible effective pour l'IK 2-segments :
    ik_r = r
    ik_z = dz + geom.l3

    # IK planaire 2-segments (epaule + coude)
    d = math.sqrt(ik_r ** 2 + ik_z ** 2)
    if d > geom.l1 + geom.l2 or d < abs(geom.l1 - geom.l2):
        return None  # hors de portee

    # Loi des cosinus pour le coude
    cos_elbow = (geom.l1 ** 2 + geom.l2 ** 2 - d ** 2) / (2 * geom.l1 * geom.l2)
    cos_elbow = clamp(cos_elbow, -1.0, 1.0)
    elbow = -(math.pi - math.acos(cos_elbow))  # negatif = coude plie vers le bas

    # Angle d'epaule
    alpha = math.atan2(ik_z, ik_r)
    cos_beta = (geom.l1 ** 2 + d ** 2 - geom.l2 ** 2) / (2 * geom.l1 * d)
    cos_beta = clamp(cos_beta, -1.0, 1.0)
    beta = math.acos(cos_beta)
    shoulder = alpha + beta

    # Wrist pitch : compense pour que la pince pointe droit vers le bas
    wrist_pitch = -(shoulder + elbow) - math.pi / 2

    # Verif limites articulaires
    for angle in (base_yaw, shoulder, elbow, wrist_pitch):
        if abs(angle) > geom.joint_limit:
            return None

    return base_yaw, shoulder, elbow, wrist_pitch, 0.0
