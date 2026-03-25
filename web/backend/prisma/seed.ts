import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.create({
    data: {
      email: 'admin@roblaude.fr',
      password: 'changeme',
      name: 'Admin',
      role: 'ADMIN',
    },
  })

  const robot = await prisma.robot.create({
    data: {
      name: 'Transbot-01',
      status: 'AVAILABLE',
    },
  })

  console.log('Seed done:', { user, robot })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
