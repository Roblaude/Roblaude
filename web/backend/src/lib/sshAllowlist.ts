// Allowlist de commandes SSH safe (lecture seule en mode ALLOWLIST).
// Le mode ELEVATED (commande libre) viendra plus tard avec re-auth interactive.

const ALLOWLIST_PATTERNS: RegExp[] = [
  // ROS — introspection topics/nodes/params
  /^ros2 topic list( -t)?$/,
  /^ros2 topic echo \/\S+( --once)?$/,
  /^ros2 topic info \/\S+$/,
  /^ros2 node list$/,
  /^ros2 node info \/\S+$/,
  /^ros2 param list( \/\S+)?$/,
  // diagnostics systeme — lecture seule
  /^uptime$/,
  /^free -h$/,
  /^df -h$/,
  /^uname -a$/,
  /^cat \/proc\/uptime$/,
  /^journalctl --no-pager -n \d{1,4}( -u [\w.-]+)?$/,
  /^docker ps$/,
  /^docker logs --tail \d{1,4} [\w.-]+$/,
]

/** Renvoie true si la commande est dans l'allowlist (match exact). */
export function isAllowlistedCommand(cmd: string): boolean {
  const trimmed = cmd.trim()
  if (trimmed.length === 0 || trimmed.length > 200) return false
  return ALLOWLIST_PATTERNS.some((re) => re.test(trimmed))
}
