"""Tests des helpers de detection 3D — numpy synthetique, pas de camera."""
import numpy as np

from roblaude_arm.detection import backproject, sample_depth_median


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
