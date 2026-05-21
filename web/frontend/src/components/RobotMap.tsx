import { useEffect, useState } from 'react'
import { useRobotStore } from '../stores/robotStore'
import { useMissionStore } from '../stores/missionStore'
import { apiFetch } from '../lib/api'

interface MapMeta {
  url: string
  resolution: number
  origin: { x: number; y: number; theta: number }
  width?: number
  height?: number
  updatedAt: string
}

// Carte 2D minimaliste — SVG natif, pas de lib.
// Convention de repere :
//   - origine (0,0) au centre de la carte (= frame `map` ou `odom` du robot)
//   - X vers la droite, Y vers le haut (math). On flip Y pour SVG (qui a Y vers le bas).
//   - Echelle : MAP_SCALE_PX_PER_M px = 1 metre
// Adaptee a une demo "zone 20x14 m" (couloir + salle ERP).

const MAP_W = 600 // viewport SVG px
const MAP_H = 400
const MAP_SCALE_PX_PER_M = 30 // 30px = 1m -> zone ~20x14 m visible
const ROBOT_RADIUS = 14

interface Props {
  className?: string
}

// Convertit coord robot (m) -> coord SVG (px), origine au centre.
function rx(x: number): number {
  return MAP_W / 2 + x * MAP_SCALE_PX_PER_M
}
function ry(y: number): number {
  // flip Y (math vers SVG)
  return MAP_H / 2 - y * MAP_SCALE_PX_PER_M
}

export function RobotMap({ className }: Props) {
  const status = useRobotStore((s) => s.status)
  const position = useRobotStore((s) => s.position)
  const robotId = useRobotStore((s) => s.id)
  const missions = useMissionStore((s) => s.missions)

  // Carte SLAM (PGM converti en PNG cote backend) — chargee une fois au mount.
  // Le PNG est sub-resource dans le SVG et le navigateur le cache (Cache-Control).
  const [mapMeta, setMapMeta] = useState<MapMeta | null>(null)
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch(`/robots/${robotId}/map`)
      .then(async (r) => (r.ok ? (await r.json()) as MapMeta : null))
      .then((meta) => {
        if (!cancelled) setMapMeta(meta)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [robotId])

  // Dimensions de l'image (en pixels) — on les recupere via onLoad du <image>.
  // En SVG natif, l'event onLoad d'un <image> n'expose pas naturalWidth donc
  // on charge via une Image() side-band.
  useEffect(() => {
    if (!mapMeta) return
    const img = new Image()
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = mapMeta.url
  }, [mapMeta])

  // Mission active (s'il y en a une) — pour afficher from/to
  const active = missions.find((m) =>
    ['PENDING', 'PAUSED', 'NAVIGATING_TO_PICKUP', 'WAITING_FOR_LOAD',
     'NAVIGATING_TO_DESTINATION', 'TRANSPORTING'].includes(m.status)
  )

  // Couleur du robot selon status
  const robotColor =
    status === 'OFFLINE' ? '#737373' :
    status === 'ERROR'   ? '#ef4444' :
    status === 'BUSY'    ? '#f59e0b' :
                           '#22c55e'

  // Heading : on dessine une fleche depuis le centre du robot
  const headRad = position.heading
  const headX = rx(position.x) + Math.cos(headRad) * (ROBOT_RADIUS + 8)
  const headY = ry(position.y) - Math.sin(headRad) * (ROBOT_RADIUS + 8)

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="w-full h-auto rounded-md border border-border bg-muted/30"
        role="img"
        aria-label={`Position du robot : x=${position.x.toFixed(2)}m, y=${position.y.toFixed(2)}m`}
      >
        {/* grille 1m */}
        <defs>
          <pattern
            id="grid"
            width={MAP_SCALE_PX_PER_M}
            height={MAP_SCALE_PX_PER_M}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${MAP_SCALE_PX_PER_M} 0 L 0 0 0 ${MAP_SCALE_PX_PER_M}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.15"
            />
          </pattern>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#grid)" />

        {/* Carte SLAM en background si dispo. Convention PGM :
            - origin (m) = coord en frame map du coin bas-gauche du PGM
            - resolution (m/px) = taille d'un pixel
            On convertit la zone couverte en coord SVG. */}
        {mapMeta && imgDims && (() => {
          const mapWm = imgDims.w * mapMeta.resolution
          const mapHm = imgDims.h * mapMeta.resolution
          const x0 = mapMeta.origin.x
          const y1 = mapMeta.origin.y + mapHm // coord robot du coin HAUT-gauche
          return (
            <image
              href={mapMeta.url}
              x={rx(x0)}
              y={ry(y1)}
              width={mapWm * MAP_SCALE_PX_PER_M}
              height={mapHm * MAP_SCALE_PX_PER_M}
              opacity={0.85}
              preserveAspectRatio="none"
            />
          )
        })()}

        {/* axes : centre */}
        <line x1={0} y1={MAP_H / 2} x2={MAP_W} y2={MAP_H / 2}
              stroke="currentColor" strokeWidth="0.5" opacity="0.3" strokeDasharray="3 3" />
        <line x1={MAP_W / 2} y1={0} x2={MAP_W / 2} y2={MAP_H}
              stroke="currentColor" strokeWidth="0.5" opacity="0.3" strokeDasharray="3 3" />

        {/* mission active : from/to */}
        {active?.fromPoint && (
          <g>
            <circle cx={rx(0)} cy={ry(0)} r={8}
                    fill="#3b82f6" opacity="0.8" />
            <text x={rx(0) + 12} y={ry(0) + 4} fontSize="11" fill="currentColor"
                  opacity="0.7" className="font-mono">
              {active.fromPoint.name}
            </text>
          </g>
        )}
        {active?.toPoint && (
          <g>
            {/* note : sans coords reelles sur les Points, on ne peut placer
                que des marqueurs symboliques. A enrichir quand Point.x/y
                sont reflectes dans la response API. */}
          </g>
        )}

        {/* fleche heading */}
        <line
          x1={rx(position.x)}
          y1={ry(position.y)}
          x2={headX}
          y2={headY}
          stroke={robotColor}
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* robot */}
        <circle
          cx={rx(position.x)}
          cy={ry(position.y)}
          r={ROBOT_RADIUS}
          fill={robotColor}
          opacity={status === 'OFFLINE' ? 0.4 : 1}
        />
        <circle
          cx={rx(position.x)}
          cy={ry(position.y)}
          r={ROBOT_RADIUS}
          fill="none"
          stroke="white"
          strokeWidth="2"
        />

        {/* coordonnees en bas de carte */}
        <text x={10} y={MAP_H - 10} fontSize="11" fill="currentColor"
              opacity="0.6" className="font-mono">
          x = {position.x.toFixed(2)} m   y = {position.y.toFixed(2)} m   θ = {(position.heading * 180 / Math.PI).toFixed(0)}°
        </text>
      </svg>
    </div>
  )
}
