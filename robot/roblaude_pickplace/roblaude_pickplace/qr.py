"""Detection QR + projection 3D, sans dependance ROS."""
from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

import numpy as np

from roblaude_pickplace.detection import backproject, sample_depth_median


@dataclass(frozen=True)
class QrCandidate:
    text: str
    points: tuple[tuple[int, int], ...]
    px: int
    py: int
    radius: int


@dataclass(frozen=True)
class QrDetection:
    qr: str
    x: float
    y: float
    z: float
    px: int
    py: int
    frame: str
    points: tuple[tuple[int, int], ...]


def _normalize_points(points: Any) -> tuple[tuple[int, int], ...]:
    arr = np.asarray(points, dtype=np.float32).reshape(-1, 2)
    if arr.shape[0] < 4:
        return tuple()
    return tuple((int(round(float(x))), int(round(float(y)))) for x, y in arr[:4])


def _center_radius(points: tuple[tuple[int, int], ...]) -> tuple[int, int, int]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    px = int(round(sum(xs) / len(xs)))
    py = int(round(sum(ys) / len(ys)))
    radius = max(1, int(round(max(max(xs) - min(xs), max(ys) - min(ys)) / 2.0)))
    return px, py, radius


def _candidate(text: str, points: Any) -> QrCandidate | None:
    if not text:
        return None
    normalized = _normalize_points(points)
    if len(normalized) != 4:
        return None
    px, py, radius = _center_radius(normalized)
    return QrCandidate(text=text, points=normalized, px=px, py=py, radius=radius)


def _is_cv2_error(exc: Exception, cv2_module: Any) -> bool:
    cv2_error = getattr(cv2_module, "error", None)
    return cv2_error is not None and isinstance(exc, cv2_error)


def detect_qr_candidates(color_img: np.ndarray | None, detector: Any = None) -> list[QrCandidate]:
    if color_img is None or getattr(color_img, "ndim", 0) != 3:
        return []

    cv2_module = None
    if detector is None:
        import cv2 as cv2_module

    qr_detector = detector or cv2_module.QRCodeDetector()
    candidates: list[QrCandidate] = []

    try:
        ok, decoded_info, points, _straight = qr_detector.detectAndDecodeMulti(color_img)
    except (ValueError, AttributeError):
        ok, decoded_info, points = False, [], None
    except Exception as exc:
        if not _is_cv2_error(exc, cv2_module):
            raise
        ok, decoded_info, points = False, [], None

    if ok and points is not None:
        for text, pts in zip(decoded_info, points):
            candidate = _candidate(text, pts)
            if candidate is not None:
                candidates.append(candidate)
        if candidates:
            return candidates

    try:
        text, points, _straight = qr_detector.detectAndDecode(color_img)
    except (ValueError, AttributeError):
        return []
    except Exception as exc:
        if not _is_cv2_error(exc, cv2_module):
            raise
        return []

    candidate = _candidate(text, points)
    return [candidate] if candidate is not None else []


def build_qr_detections(
    color_img: np.ndarray | None,
    depth_img: np.ndarray | None,
    detector: Any,
    depth_scale: float,
    min_depth: float,
    max_depth: float,
    fx: float,
    fy: float,
    cx: float,
    cy: float,
    frame: str,
) -> list[QrDetection]:
    detections: list[QrDetection] = []
    for candidate in detect_qr_candidates(color_img, detector):
        z = sample_depth_median(
            depth_img,
            candidate.px,
            candidate.py,
            candidate.radius,
            depth_scale,
            min_depth,
            max_depth,
        )
        x3d, y3d, z3d = backproject(candidate.px, candidate.py, z, fx, fy, cx, cy)
        detections.append(
            QrDetection(
                qr=candidate.text,
                x=float(x3d),
                y=float(y3d),
                z=float(z3d),
                px=candidate.px,
                py=candidate.py,
                frame=frame,
                points=candidate.points,
            )
        )
    return detections


def qr_detections_to_json(detections: list[QrDetection]) -> str:
    payload = [
        {
            "qr": det.qr,
            "x": det.x,
            "y": det.y,
            "z": det.z,
            "px": det.px,
            "py": det.py,
            "frame": det.frame,
        }
        for det in detections
    ]
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
