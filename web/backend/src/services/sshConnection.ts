import { NodeSSH } from 'node-ssh'

// Connexion SSH persistante par robotId. Reutilisee par wsTopics, et plus
// tard par wsLogs/wsSsh (T3.5.12). NodeSSH wrappe ssh2, API Promise-based.

type RobotSshConfig = {
  host: string
  port: number
  username: string
  privateKey?: Buffer
  password?: string
}

function getConfig(robotId: number): RobotSshConfig {
  return {
    host: process.env[`ROBOT_${robotId}_SSH_HOST`] ?? '192.168.1.100',
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
    await ssh.connect(getConfig(robotId))
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

export async function runOnce(
  robotId: number,
  command: string,
  timeoutMs = 5000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const ssh = await getSshClient(robotId)
  const timeoutPromise = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error('ssh timeout')), timeoutMs),
  )
  const result = await Promise.race([ssh.execCommand(command), timeoutPromise])
  return { stdout: result.stdout, stderr: result.stderr, code: result.code ?? 0 }
}
