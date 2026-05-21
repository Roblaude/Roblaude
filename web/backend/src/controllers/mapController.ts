import { Request, Response } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { parse as parseYaml } from 'yaml'

// Sert la carte SLAM (PGM + YAML) du robot via l'API.
// Pipeline mapping -> serving :
//   robot : ros2 run nav2_map_server map_saver_cli -f /root/maps/1
//   user  : scp jetson@<robot>:/home/jetson/robot_maps/1.{pgm,yaml} web/backend/maps/
//   web   : GET /api/robots/1/map  (metadata JSON)
//          GET /api/robots/1/map.png  (image, cache 30s)
//
// Plus tard on pourra automatiser le scp via une route POST /map/sync.

const MAPS_DIR = path.resolve(__dirname, '../../maps')

interface MapMetadata {
  resolution: number  // metres par pixel
  origin: [number, number, number]  // x, y, yaw en frame map
  negate?: number
  occupied_thresh?: number
  free_thresh?: number
}

// Cache PNG en memoire pour eviter de re-decoder le PGM a chaque requete.
// Invalide si le fichier PGM change (mtime).
const pngCache = new Map<number, { png: Buffer; mtimeMs: number; width: number; height: number }>()

async function readMetadata(robotId: number): Promise<MapMetadata | null> {
  const yamlPath = path.join(MAPS_DIR, `${robotId}.yaml`)
  try {
    const raw = await fs.readFile(yamlPath, 'utf8')
    return parseYaml(raw) as MapMetadata
  } catch {
    return null
  }
}

export async function getMapMetadata(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }
  const meta = await readMetadata(id)
  if (!meta) {
    res.status(404).json({ error: 'Carte non disponible pour ce robot' })
    return
  }
  const pgmPath = path.join(MAPS_DIR, `${id}.pgm`)
  try {
    const stat = await fs.stat(pgmPath)
    const cached = pngCache.get(id)
    let width = cached?.width
    let height = cached?.height
    // Si pas en cache (ou stale), on touche pas — on retourne juste meta + URL.
    // Les dimensions exactes seront connues apres premier GET du PNG.
    res.json({
      url: `/api/robots/${id}/map.png?v=${stat.mtimeMs}`,
      resolution: meta.resolution,
      origin: { x: meta.origin[0], y: meta.origin[1], theta: meta.origin[2] },
      width,
      height,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
    })
  } catch {
    res.status(404).json({ error: 'PGM introuvable' })
  }
}

export async function getMapImage(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ error: 'ID invalide' })
    return
  }

  const pgmPath = path.join(MAPS_DIR, `${id}.pgm`)
  let stat: Awaited<ReturnType<typeof fs.stat>>
  try {
    stat = await fs.stat(pgmPath)
  } catch {
    res.status(404).json({ error: 'Carte introuvable' })
    return
  }

  // cache hit ?
  const cached = pngCache.get(id)
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'private, max-age=30')
    res.send(cached.png)
    return
  }

  // Re-decode PGM -> PNG. sharp lit le PGM raw natif (libvips).
  try {
    const image = sharp(pgmPath)
    const meta = await image.metadata()
    const png = await image.png().toBuffer()
    pngCache.set(id, {
      png,
      mtimeMs: stat.mtimeMs,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    })
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'private, max-age=30')
    res.send(png)
  } catch (err) {
    console.error('[map] conversion PGM->PNG echoue :', err)
    res.status(500).json({ error: 'Conversion image impossible' })
  }
}
