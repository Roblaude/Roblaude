import { describe, it, expect } from 'vitest'
import { isAllowlistedCommand } from '../lib/sshAllowlist'

describe('sshAllowlist', () => {
  const allowed = [
    'ros2 topic list',
    'ros2 topic list -t',
    'ros2 topic echo /scan --once',
    'ros2 node list',
    'uptime',
    'free -h',
    'df -h',
    'journalctl --no-pager -n 100',
    'journalctl --no-pager -n 50 -u roblaude.service',
    'docker ps',
    'docker logs --tail 100 m3pro',
  ]
  const rejected = [
    'rm -rf /',
    'cat /etc/passwd',
    'ros2 topic list; rm -rf /',
    'sudo reboot',
    'echo hello',
    '',
    'a'.repeat(250),
    'ros2 topic list -t || ls',
  ]

  it.each(allowed)('autorise: %s', (cmd) => {
    expect(isAllowlistedCommand(cmd)).toBe(true)
  })

  it.each(rejected)('refuse: %s', (cmd) => {
    expect(isAllowlistedCommand(cmd)).toBe(false)
  })
})
