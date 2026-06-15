"""Tests de la lib IK — hors ROS, juste pytest."""
import math

from roblaude_pickplace.arm_kin import ArmGeometry, clamp, compute_ik, rad_to_servo


def test_clamp():
    assert clamp(5, 0, 10) == 5
    assert clamp(-3, 0, 10) == 0
    assert clamp(42, 0, 10) == 10


def test_rad_to_servo_centre():
    # 0 rad = centre = 90 deg servo
    assert rad_to_servo(0.0) == 90.0


def test_rad_to_servo_extremes():
    assert rad_to_servo(math.pi / 2) == 180.0
    assert rad_to_servo(-math.pi / 2) == 0.0


def test_rad_to_servo_saturation():
    # au-dela de +-90 deg, on sature aux bornes 0..180
    assert rad_to_servo(math.pi) == 180.0
    assert rad_to_servo(-math.pi) == 0.0


def test_ik_cible_atteignable():
    # cible devant le bras, faisable (contrainte poignet vers le bas incluse)
    res = compute_ik(0.16, 0.0, 0.20)
    assert res is not None
    assert len(res) == 5
    base_yaw, shoulder, elbow, wrist_pitch, wrist_roll = res
    assert wrist_roll == 0.0
    geom = ArmGeometry()
    for angle in (base_yaw, shoulder, elbow, wrist_pitch):
        assert abs(angle) <= geom.joint_limit


def test_ik_base_yaw_diagonale():
    # dx == dy > 0 (dx = 0.11 - 0.02 = 0.09, dy = 0.09) -> rotation base = pi/4
    res = compute_ik(0.11, 0.09, 0.21)
    assert res is not None
    base_yaw = res[0]
    assert math.isclose(base_yaw, math.pi / 4, abs_tol=1e-6)


def test_ik_hors_portee_loin():
    # cible trop loin : d > l1 + l2
    assert compute_ik(0.5, 0.0, 0.24) is None


def test_ik_hors_limite_articulaire():
    # cible derriere la base -> base_yaw ~ pi, viole la limite +-1.57
    assert compute_ik(-0.10, 0.0, 0.24) is None
