// Ecriture/lecture des cartes SLAM (PGM + YAML + PNG) sur disque.
// Stockage : web/backend/maps/<snapshotId>.{pgm,yaml,png}
// PNG genere via sharp (libvips lit le PGM raw natif).

import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const MAPS_DIR = path.resolve(process.cwd(), 'maps')

async function ensureDir(): Promise<void> {
  if (!existsSync(MAPS_DIR)) await mkdir(MAPS_DIR, { recursive: true })
}

export async function saveSnapshotFiles(
  snapshotId: number,
  pgmBase64: string,
  yamlContent: string,
): Promise<{ pgmPath: string; yamlPath: string; pngPath: string; sizeBytes: number }> {
  await ensureDir()
  const pgmBuf = Buffer.from(pgmBase64, 'base64')
  const pgmPath = path.join(MAPS_DIR, `${snapshotId}.pgm`)
  const yamlPath = path.join(MAPS_DIR, `${snapshotId}.yaml`)
  const pngPath = path.join(MAPS_DIR, `${snapshotId}.png`)
  await writeFile(pgmPath, pgmBuf)
  await writeFile(yamlPath, yamlContent)
  // sharp lit le PGM raw via libvips, sortie PNG vraie -> le snapshot est
  // ouvrable directement dans n'importe quel viewer (vs PGM = niche).
  try {
    const pngBuf = await sharp(pgmBuf).png().toBuffer()
    await writeFile(pngPath, pngBuf)
  } catch (err) {
    // fallback PGM brut si sharp echoue (PGM mal forme ?) — on prefere
    // garder un fichier que rien du tout, le snapshot reste recuperable.
    console.error('[mapStorage] sharp PGM->PNG echec :', err instanceof Error ? err.message : err)
    await writeFile(pngPath, pgmBuf)
  }
  return { pgmPath, yamlPath, pngPath, sizeBytes: pgmBuf.length }
}

export async function readSnapshotFile(snapshotId: number, ext: 'pgm' | 'yaml' | 'png'): Promise<Buffer> {
  return readFile(path.join(MAPS_DIR, `${snapshotId}.${ext}`))
}

export function getSnapshotPath(snapshotId: number, ext: 'pgm' | 'yaml' | 'png'): string {
  return path.join(MAPS_DIR, `${snapshotId}.${ext}`)
}
