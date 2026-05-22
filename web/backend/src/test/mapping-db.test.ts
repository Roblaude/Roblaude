import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, MappingState, SshMode, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

let userId: number
let robotId: number

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `test-mapping-${Date.now()}@x.com`, password: bcrypt.hashSync('x', 4), name: 'test', role: Role.ADMIN },
  })
  userId = user.id
  const robot = await prisma.robot.create({ data: { name: `bot-${Date.now()}` } })
  robotId = robot.id
})

afterAll(async () => {
  await prisma.sshAuditLog.deleteMany({ where: { robotId } })
  await prisma.annotation.deleteMany({ where: { mapSnapshot: { robotId } } })
  await prisma.mapSnapshot.deleteMany({ where: { robotId } })
  await prisma.mappingSession.deleteMany({ where: { robotId } })
  await prisma.robot.delete({ where: { id: robotId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe('Mapping DB schema', () => {
  it('crée une MappingSession avec relation user et robot', async () => {
    const s = await prisma.mappingSession.create({
      data: { robotId, startedById: userId, state: MappingState.STARTING },
      include: { robot: true, startedBy: true },
    })
    expect(s.id).toBeGreaterThan(0)
    expect(s.robot.id).toBe(robotId)
    expect(s.startedBy.id).toBe(userId)
    expect(s.state).toBe(MappingState.STARTING)
  })

  it('crée un MapSnapshot lié à une session puis une Annotation lié au snapshot', async () => {
    const session = await prisma.mappingSession.create({
      data: { robotId, startedById: userId, state: MappingState.RUNNING },
    })
    const snap = await prisma.mapSnapshot.create({
      data: {
        sessionId: session.id, robotId, name: 'demo',
        pgmPath: '/tmp/x.pgm', yamlPath: '/tmp/x.yaml', pngPath: '/tmp/x.png',
        widthPx: 400, heightPx: 280, resolutionM: 0.05,
        originX: -10, originY: -7, originTheta: 0, sizeBytes: 1024,
      },
    })
    const a = await prisma.annotation.create({
      data: { mapSnapshotId: snap.id, sessionId: session.id, label: 'bureau 201', x: 1.5, y: 2.0, createdById: userId },
      include: { mapSnapshot: true, createdBy: true },
    })
    expect(a.mapSnapshot.id).toBe(snap.id)
    expect(a.createdBy.id).toBe(userId)
    expect(a.color).toBe('#3b82f6')
  })

  it('crée un SshAuditLog ALLOWLIST', async () => {
    const log = await prisma.sshAuditLog.create({
      data: { robotId, userId, mode: SshMode.ALLOWLIST, command: 'ros2 topic list', exitCode: 0, durationMs: 120 },
    })
    expect(log.id).toBeGreaterThan(0)
    expect(log.mode).toBe(SshMode.ALLOWLIST)
  })

  it('back-relation : Robot.mappingSessions renvoie les sessions du robot', async () => {
    const r = await prisma.robot.findUnique({ where: { id: robotId }, include: { mappingSessions: true } })
    expect(r?.mappingSessions.length).toBeGreaterThanOrEqual(2)
  })
})
