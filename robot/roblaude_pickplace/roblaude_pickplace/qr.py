"""Detection QR/AprilTag + projection 3D, sans dependance ROS."""
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


def _zbar_points(decoded: Any) -> tuple[tuple[int, int], ...]:
    polygon = getattr(decoded, "polygon", None)
    if polygon and len(polygon) >= 4:
        return tuple((int(p.x), int(p.y)) for p in polygon[:4])

    rect = getattr(decoded, "rect", None)
    if rect is None:
        return tuple()
    left = int(getattr(rect, "left", 0))
    top = int(getattr(rect, "top", 0))
    width = int(getattr(rect, "width", 0))
    height = int(getattr(rect, "height", 0))
    if width <= 0 or height <= 0:
        return tuple()
    return ((left, top), (left + width, top), (left + width, top + height), (left, top + height))


def _load_zbar_decode(zbar_decode: Any = None) -> Any | None:
    if zbar_decode is None:
        try:
            from pyzbar.pyzbar import decode as zbar_decode
        except Exception:
            return None
    return zbar_decode


def _detect_qr_candidates_zbar(color_img: np.ndarray, zbar_decode: Any = None) -> list[QrCandidate]:
    zbar_decode = _load_zbar_decode(zbar_decode)
    if zbar_decode is None:
        return []

    candidates: list[QrCandidate] = []
    try:
        decoded_items = zbar_decode(color_img)
    except Exception:
        return []

    for decoded in decoded_items:
        raw = getattr(decoded, "data", b"")
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
        candidate = _candidate(text, _zbar_points(decoded))
        if candidate is not None:
            candidates.append(candidate)
    return candidates


MARKER_DICTIONARIES = (
    "DICT_APRILTAG_36h11",
    "DICT_APRILTAG_36h10",
    "DICT_APRILTAG_25h9",
    "DICT_APRILTAG_16h5",
    "DICT_4X4_50",
    "DICT_4X4_100",
    "DICT_5X5_50",
    "DICT_5X5_100",
    "DICT_6X6_50",
    "DICT_6X6_100",
)


def _aruco_dictionary(aruco_module: Any, name: str) -> Any | None:
    if not hasattr(aruco_module, name):
        return None
    dictionary_id = getattr(aruco_module, name)
    if hasattr(aruco_module, "getPredefinedDictionary"):
        return aruco_module.getPredefinedDictionary(dictionary_id)
    if hasattr(aruco_module, "Dictionary_get"):
        return aruco_module.Dictionary_get(dictionary_id)
    return None


def _aruco_parameters(aruco_module: Any) -> Any | None:
    if hasattr(aruco_module, "DetectorParameters_create"):
        return aruco_module.DetectorParameters_create()
    if hasattr(aruco_module, "DetectorParameters"):
        return aruco_module.DetectorParameters()
    return None


def _marker_text(dictionary_name: str, marker_id: int) -> str:
    return f"{dictionary_name.removeprefix('DICT_')}:{marker_id}"


def _detect_qr_candidates_aruco(color_img: np.ndarray, aruco_module: Any = None) -> list[QrCandidate]:
    cv2_module = None
    if aruco_module is None:
        try:
            import cv2 as cv2_module
            aruco_module = cv2_module.aruco
        except Exception:
            return []

    if not hasattr(aruco_module, "detectMarkers"):
        return []

    image = color_img
    if cv2_module is not None:
        image = cv2_module.cvtColor(color_img, cv2_module.COLOR_RGB2GRAY)
    parameters = _aruco_parameters(aruco_module)

    for dictionary_name in MARKER_DICTIONARIES:
        dictionary = _aruco_dictionary(aruco_module, dictionary_name)
        if dictionary is None:
            continue
        try:
            corners, ids, _rejected = aruco_module.detectMarkers(
                image,
                dictionary,
                parameters=parameters,
            )
        except Exception:
            continue
        if ids is None or len(ids) == 0:
            continue

        candidates: list[QrCandidate] = []
        for marker_id, pts in zip(np.asarray(ids).reshape(-1), corners):
            candidate = _candidate(_marker_text(dictionary_name, int(marker_id)), pts)
            if candidate is not None:
                candidates.append(candidate)
        if candidates:
            return candidates
    return []


def _is_cv2_error(exc: Exception, cv2_module: Any) -> bool:
    cv2_error = getattr(cv2_module, "error", None)
    return cv2_error is not None and isinstance(exc, cv2_error)


def detect_qr_candidates(
    color_img: np.ndarray | None,
    detector: Any = None,
    zbar_decode: Any = None,
    aruco_module: Any = None,
) -> list[QrCandidate]:
    if color_img is None or getattr(color_img, "ndim", 0) != 3:
        return []

    if detector is None:
        zbar_decode_resolved = _load_zbar_decode(zbar_decode)
        if zbar_decode_resolved is not None:
            candidates = _detect_qr_candidates_zbar(color_img, zbar_decode_resolved)
            if candidates:
                return candidates

        candidates = _detect_qr_candidates_aruco(color_img, aruco_module)
        if candidates:
            return candidates

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
        return _detect_qr_candidates_zbar(color_img, zbar_decode)
    except Exception as exc:
        if not _is_cv2_error(exc, cv2_module):
            raise
        return _detect_qr_candidates_zbar(color_img, zbar_decode)

    candidate = _candidate(text, points)
    if candidate is not None:
        return [candidate]
    return _detect_qr_candidates_zbar(color_img, zbar_decode)


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
