import { NodeSSH } from 'node-ssh'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

// Connexion SSH persistante par robotId. NodeSSH wrappe ssh2, API Promise-based.

type RobotSshConfig = {
  host: string
  port: number
  username: string
  privateKey?: Buffer
  password?: string
}

// L'IP du robot change au gre du DHCP. Si ROBOT_{id}_SSH_MAC est fourni, on
// resout l'IP COURANTE par la MAC via la table ARP du systeme (comme
// find_robot.sh). Le robot parle en permanence au broker MQTT (sur cette
// machine) -> sa MAC est toujours dans l'ARP. Fallback sur ROBOT_{id}_SSH_HOST.
async function resolveIpByMac(mac: string): Promise<string | null> {
  const norm = mac.toLowerCase()
  try {
    const { stdout } = await execFileP('arp', ['-an'])
    for (const line of stdout.split('\n')) {
      if (line.toLowerCase().includes(norm)) {
        const m = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/)
        if (m) return m[1]
      }
    }
  } catch { /* arp indispo (autre OS) -> fallback host */ }
  return null
}

async function getConfig(robotId: number): Promise<RobotSshConfig> {
  let host = process.env[`ROBOT_${robotId}_SSH_HOST`] ?? '192.168.1.100'
  const mac = process.env[`ROBOT_${robotId}_SSH_MAC`]
  if (mac) {
    const ip = await resolveIpByMac(mac)
    if (ip) host = ip   // IP courante resolue par MAC, peu importe le DHCP
  }
  return {
    host,
    port: Number(process.env[`ROBOT_${robotId}_SSH_PORT`] ?? 22),
    username: process.env[`ROBOT_${robotId}_SSH_USER`] ?? 'jetson',
    password: process.env[`ROBOT_${robotId}_SSH_PASSWORD`],
  }
}

const cache = new Map<number, Promise<NodeSSH>>()

export function getSshClient(robotId: number): Promise<NodeSSH> {
  let p = cache.get(robotId)
  if (p) return p
  p = (async () => {
    const ssh = new NodeSSH()
    // cast as any — RobotSshConfig.privateKey est Buffer mais NodeSSH veut string ;
    // node-ssh accepte les deux a l'execution.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ssh.connect((await getConfig(robotId)) as any)
    return ssh
  })()
  // si fail, on vire du cache pour permettre un retry au prochain appel.
  p.catch(() => cache.delete(robotId))
  cache.set(robotId, p)
  return p
}

/** Reset cache — utile pour les tests. */
export function _resetSshCache(): void {
  cache.clear()
}

// evince ET FERME la connexion (dispose). Sinon les connexions mortes restent
// ouvertes -> les sshd s'accumulent sur le robot -> SSH lent -> timeouts.
function evict(robotId: number): void {
  const p = cache.get(robotId)
  cache.delete(robotId)
  void p?.then((ssh) => { try { ssh.dispose() } catch { /* deja mort */ } }).catch(() => {})
}

export async function runOnce(
  robotId: number,
  command: string,
  timeoutMs = 5000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  // 2 tentatives : une connexion en cache peut etre MORTE (sshd ferme les
  // sessions inactives). On detecte (isConnected) ou on attrape l'echec, on
  // evince du cache et on reconnecte. Sinon un robot joignable apparait KO.
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let ssh = await getSshClient(robotId)
      if (!ssh.isConnected()) {
        evict(robotId)
        ssh = await getSshClient(robotId)
      }
      const timeoutPromise = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('ssh timeout')), timeoutMs),
      )
      const result = await Promise.race([ssh.execCommand(command), timeoutPromise])
      return { stdout: result.stdout, stderr: result.stderr, code: result.code ?? 0 }
    } catch (e) {
      lastErr = e
      evict(robotId)   // ferme la connexion morte -> pas d'accumulation de sshd
    }
  }
  throw lastErr ?? new Error('ssh unreachable')
}
