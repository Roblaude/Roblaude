"""Helpers de detection 3D — numpy pur (pas d'OpenCV ni ROS), testables.

Le node object_detector fait la partie OpenCV (masque HSV, contours) et appelle
ces fonctions pour passer du pixel au point 3D dans le repere optique camera.
"""
import numpy as np


def sample_depth_median(depth, cx: int, cy: int, radius: float,
                        depth_scale: float, min_depth: float,
                        max_depth: float) -> float:
    """Mediane de la profondeur autour du centroide (rejet des outliers).

    `depth` : image profondeur (uint16 en mm si depth_scale=0.001, ou float32 en
    metres avec depth_scale=1.0), ou None. Renvoie une distance en metres, ou
    0.0 si pas de mesure valide.
    """
    if depth is None:
        return 0.0
    h, w = depth.shape[:2]
    cx, cy = int(cx), int(cy)
    if not (0 <= cy < h and 0 <= cx < w):
        return 0.0
    r = max(1, int(radius * 0.3))
    y1, y2 = max(0, cy - r), min(h, cy + r)
    x1, x2 = max(0, cx - r), min(w, cx + r)
    region = depth[y1:y2, x1:x2].astype(np.float64)
    if depth.dtype == np.uint16:
        region = region * depth_scale
    valid = region[(region > min_depth) & (region < max_depth)]
    if valid.size == 0:
        return 0.0
    return float(np.median(valid))


def backproject(cx: float, cy: float, z: float,
                fx: float, fy: float, cx0: float, cy0: float):
    """Pixel (cx, cy) + profondeur z -> point 3D (x, y, z) repere optique camera.

    Renvoie (0, 0, 0) si z <= 0 (pas de profondeur valide).
    """
    if z <= 0:
        return 0.0, 0.0, 0.0
    x = (cx - cx0) / fx * z
    y = (cy - cy0) / fy * z
    return x, y, z


def select_best_detection(points):
    """Parmi des points (x, y, z), garde le plus proche avec profondeur valide.

    `points` : iterable de (x, y, z) dans le repere optique camera. Ignore les
    z <= 0 (pas de depth). Renvoie le (x, y, z) le plus proche, ou None.
    """
    best = None
    best_d = float('inf')
    for (x, y, z) in points:
        if z <= 0:
            continue
        d = x * x + y * y + z * z
        if d < best_d:
            best_d = d
            best = (x, y, z)
    return best


def transform_point(px, py, pz, tx, ty, tz, qx, qy, qz, qw):
    """Applique une transfo TF (rotation quaternion + translation) a un point.

    Sert a passer une detection du repere optique camera vers base_link, a
    partir du lookup_transform TF. Formule de rotation par quaternion standard.
    """
    rx = px + 2.0 * (-(qy * qy + qz * qz) * px
                     + (qx * qy - qw * qz) * py
                     + (qx * qz + qw * qy) * pz)
    ry = py + 2.0 * ((qx * qy + qw * qz) * px
                     - (qx * qx + qz * qz) * py
                     + (qy * qz - qw * qx) * pz)
    rz = pz + 2.0 * ((qx * qz - qw * qy) * px
                     + (qy * qz + qw * qx) * py
                     - (qx * qx + qy * qy) * pz)
    return rx + tx, ry + ty, rz + tz
