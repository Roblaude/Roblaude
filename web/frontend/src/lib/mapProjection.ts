// Conversion coordonnees world (m) <-> pixel carte SLAM.
// La carte ROS a son origine en bas-gauche, l'image PNG en haut-gauche
// => on flippe Y.

export interface MapProjectionMeta {
  width: number
  height: number
  resolution: number
  originX: number
  originY: number
}

/** Convertit (x_world, y_world) en m vers (x_px, y_px) dans l'image PNG. */
export function worldToPixel(
  meta: MapProjectionMeta,
  xWorld: number,
  yWorld: number,
): { x: number; y: number } {
  const x = (xWorld - meta.originX) / meta.resolution
  const y = meta.height - (yWorld - meta.originY) / meta.resolution
  return { x, y }
}

export function pixelToWorld(
  meta: MapProjectionMeta,
  xPx: number,
  yPx: number,
): { x: number; y: number } {
  const x = xPx * meta.resolution + meta.originX
  const y = (meta.height - yPx) * meta.resolution + meta.originY
  return { x, y }
}
