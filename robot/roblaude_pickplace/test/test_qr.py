"""Tests QR sans camera reelle : OpenCV est remplace par un faux detecteur."""
import json

import numpy as np

from roblaude_pickplace.qr import (
    build_qr_detections,
    detect_qr_candidates,
    qr_detections_to_json,
)


class FakeMultiDetector:
    def detectAndDecodeMulti(self, _image):
        points = np.array(
            [
                [[10.0, 20.0], [30.0, 20.0], [30.0, 40.0], [10.0, 40.0]],
                [[50.0, 10.0], [70.0, 10.0], [70.0, 30.0], [50.0, 30.0]],
            ],
            dtype=np.float32,
        )
        return True, ["OBJ_001", ""], points, None


class FakeSingleDetector:
    def detectAndDecodeMulti(self, _image):
        return False, [], None, None

    def detectAndDecode(self, _image):
        points = np.array(
            [[[15.0, 25.0], [35.0, 25.0], [35.0, 45.0], [15.0, 45.0]]],
            dtype=np.float32,
        )
        return "OBJ_SINGLE", points, None


class FakeEmptyDetector:
    def detectAndDecodeMulti(self, _image):
        return True, ["", ""], np.zeros((2, 4, 2), dtype=np.float32), None

    def detectAndDecode(self, _image):
        return "", None, None


def test_detect_qr_candidates_multi_ignore_text_empty():
    image = np.zeros((80, 80, 3), dtype=np.uint8)
    candidates = detect_qr_candidates(image, FakeMultiDetector())

    assert len(candidates) == 1
    assert candidates[0].text == "OBJ_001"
    assert candidates[0].points == ((10, 20), (30, 20), (30, 40), (10, 40))
    assert candidates[0].px == 20
    assert candidates[0].py == 30
    assert candidates[0].radius == 10


def test_detect_qr_candidates_single_fallback():
    image = np.zeros((80, 80, 3), dtype=np.uint8)
    candidates = detect_qr_candidates(image, FakeSingleDetector())

    assert len(candidates) == 1
    assert candidates[0].text == "OBJ_SINGLE"
    assert candidates[0].px == 25
    assert candidates[0].py == 35


def test_detect_qr_candidates_empty_image_or_empty_text():
    assert detect_qr_candidates(None, FakeEmptyDetector()) == []
    assert detect_qr_candidates(np.zeros((80, 80), dtype=np.uint8), FakeEmptyDetector()) == []
    assert detect_qr_candidates(np.zeros((80, 80, 3), dtype=np.uint8), FakeEmptyDetector()) == []


def test_build_qr_detections_with_depth_and_backprojection():
    image = np.zeros((80, 80, 3), dtype=np.uint8)
    depth = np.full((80, 80), 500, dtype=np.uint16)

    detections = build_qr_detections(
        color_img=image,
        depth_img=depth,
        detector=FakeMultiDetector(),
        depth_scale=0.001,
        min_depth=0.15,
        max_depth=1.0,
        fx=100.0,
        fy=100.0,
        cx=20.0,
        cy=30.0,
        frame="camera_color_optical_frame",
    )

    assert len(detections) == 1
    assert detections[0].qr == "OBJ_001"
    assert detections[0].px == 20
    assert detections[0].py == 30
    assert detections[0].x == 0.0
    assert detections[0].y == 0.0
    assert abs(detections[0].z - 0.5) < 1e-9
    assert detections[0].frame == "camera_color_optical_frame"


def test_build_qr_detections_invalid_depth_keeps_pixel_and_zero_xyz():
    image = np.zeros((80, 80, 3), dtype=np.uint8)
    depth = np.zeros((80, 80), dtype=np.uint16)

    detections = build_qr_detections(
        color_img=image,
        depth_img=depth,
        detector=FakeMultiDetector(),
        depth_scale=0.001,
        min_depth=0.15,
        max_depth=1.0,
        fx=100.0,
        fy=100.0,
        cx=20.0,
        cy=30.0,
        frame="camera_color_optical_frame",
    )

    assert len(detections) == 1
    assert detections[0].qr == "OBJ_001"
    assert (detections[0].x, detections[0].y, detections[0].z) == (0.0, 0.0, 0.0)


def test_qr_detections_to_json_contract():
    image = np.zeros((80, 80, 3), dtype=np.uint8)
    depth = np.full((80, 80), 500, dtype=np.uint16)
    detections = build_qr_detections(
        color_img=image,
        depth_img=depth,
        detector=FakeMultiDetector(),
        depth_scale=0.001,
        min_depth=0.15,
        max_depth=1.0,
        fx=100.0,
        fy=100.0,
        cx=20.0,
        cy=30.0,
        frame="camera_color_optical_frame",
    )

    payload = json.loads(qr_detections_to_json(detections))

    assert payload == [
        {
            "qr": "OBJ_001",
            "x": 0.0,
            "y": 0.0,
            "z": 0.5,
            "px": 20,
            "py": 30,
            "frame": "camera_color_optical_frame",
        }
    ]
