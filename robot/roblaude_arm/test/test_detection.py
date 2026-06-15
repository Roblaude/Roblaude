"""Tests des helpers de detection 3D — numpy synthetique, pas de camera."""
import math

import numpy as np

from roblaude_arm.detection import (backproject, sample_depth_median,
                                    select_best_detection, transform_point)


def test_depth_median_uint16_mm():
    # image 10x10 a 800mm partout -> 0.8 m
    depth = np.full((10, 10), 800, dtype=np.uint16)
    z = sample_depth_median(depth, cx=5, cy=5, radius=4,
                            depth_scale=0.001, min_depth=0.15, max_depth=1.0)
    assert abs(z - 0.8) < 1e-6


def test_depth_median_rejette_zeros():
    # fond a 0 (invalide) + un patch valide a 500mm autour du centroide
    depth = np.zeros((20, 20), dtype=np.uint16)
    depth[8:13, 8:13] = 500
    z = sample_depth_median(depth, cx=10, cy=10, radius=10,
                            depth_scale=0.001, min_depth=0.15, max_depth=1.0)
    assert abs(z - 0.5) < 1e-6


def test_depth_hors_image():
    depth = np.full((10, 10), 800, dtype=np.uint16)
    z = sample_depth_median(depth, cx=99, cy=99, radius=3,
                            depth_scale=0.001, min_depth=0.15, max_depth=1.0)
    assert z == 0.0


def test_depth_none():
    assert sample_depth_median(None, 5, 5, 3, 0.001, 0.15, 1.0) == 0.0


def test_backproject_centre_optique():
    # pixel au centre optique -> x=y=0, z conserve
    x, y, z = backproject(cx=320, cy=240, z=0.7,
                          fx=600, fy=600, cx0=320, cy0=240)
    assert x == 0.0 and y == 0.0 and z == 0.7


def test_backproject_decalage():
    # 60 px a droite du centre, fx=600, z=0.5 -> x = 60/600*0.5 = 0.05
    x, _y, _z = backproject(cx=380, cy=240, z=0.5,
                            fx=600, fy=600, cx0=320, cy0=240)
    assert abs(x - 0.05) < 1e-9


def test_backproject_sans_depth():
    assert backproject(380, 240, 0.0, 600, 600, 320, 240) == (0.0, 0.0, 0.0)


def test_select_best_prend_le_plus_proche():
    pts = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.9), (0.1, 0.0, 0.4)]
    best = select_best_detection(pts)
    assert best == (0.1, 0.0, 0.4)  # le plus proche, z valide


def test_select_best_ignore_z_nul():
    assert select_best_detection([(0.5, 0.5, 0.0)]) is None


def test_select_best_vide():
    assert select_best_detection([]) is None


def test_transform_identite_translation():
    # quaternion identite (0,0,0,1) -> juste la translation
    x, y, z = transform_point(1.0, 2.0, 3.0, 0.1, 0.2, 0.3, 0, 0, 0, 1)
    assert (round(x, 6), round(y, 6), round(z, 6)) == (1.1, 2.2, 3.3)


def test_transform_rotation_90_z():
    # rotation 90 deg autour de Z : (1,0,0) -> (0,1,0)
    s = math.sin(math.pi / 4)
    c = math.cos(math.pi / 4)
    x, y, z = transform_point(1.0, 0.0, 0.0, 0, 0, 0, 0, 0, s, c)
    assert abs(x - 0.0) < 1e-9
    assert abs(y - 1.0) < 1e-9
    assert abs(z - 0.0) < 1e-9
