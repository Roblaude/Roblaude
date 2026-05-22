// Ecriture/lecture des cartes SLAM (PGM + YAML + PNG) sur disque.
// Stockage : web/backend/maps/<snapshotId>.{pgm,yaml,png}
// Le PNG MVP = copie du PGM (le frontend recoit le live PNG via /telemetry/map).

import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

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
  // todo: convertir PGM -> PNG via sharp (cf. mapController). MVP : copie brute.
  await writeFile(pngPath, pgmBuf)
  return { pgmPath, yamlPath, pngPath, sizeBytes: pgmBuf.length }
}

export async function readSnapshotFile(snapshotId: number, ext: 'pgm' | 'yaml' | 'png'): Promise<Buffer> {
  return readFile(path.join(MAPS_DIR, `${snapshotId}.${ext}`))
}

export function getSnapshotPath(snapshotId: number, ext: 'pgm' | 'yaml' | 'png'): string {
  return path.join(MAPS_DIR, `${snapshotId}.${ext}`)
}
