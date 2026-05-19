import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Users (mot de passe par defaut: "changeme")
  const hashed = await bcrypt.hash('changeme', 10)
  const admin = await prisma.user.create({
    data: { email: 'admin@roblaude.fr', password: hashed, name: 'Admin', role: 'ADMIN' },
  })
  const user = await prisma.user.create({
    data: { email: 'marie@roblaude.fr', password: hashed, name: 'Marie Dupont', role: 'USER' },
  })

  // Robot
  const robot = await prisma.robot.create({
    data: { name: 'Transbot-01', status: 'AVAILABLE', battery: 95 },
  })

  // Points
  const accueil = await prisma.point.create({
    data: { name: 'Accueil', slug: 'accueil', x: 0, y: 0, description: 'Hall d\'entrée' },
  })
  const bureau201 = await prisma.point.create({
    data: { name: 'Bureau 201', slug: 'bureau-201', x: 5.2, y: 3.1, description: 'Deuxième étage' },
  })
  const salleReunion = await prisma.point.create({
    data: { name: 'Salle de réunion', slug: 'salle-reunion', x: 8.0, y: 1.5 },
  })
  const stockage = await prisma.point.create({
    data: { name: 'Local stockage', slug: 'stockage', x: 2.3, y: 6.7, description: 'Fournitures' },
  })
  const infirmerie = await prisma.point.create({
    data: { name: 'Infirmerie', slug: 'infirmerie', x: 10.1, y: 4.2 },
  })

  // Object
  const dossier = await prisma.graspObject.create({
    data: { name: 'Dossier médical', locationId: stockage.id },
  })

  console.log('Seed done:', {
    users: [admin.name, user.name],
    robot: robot.name,
    points: [accueil.name, bureau201.name, salleReunion.name, stockage.name, infirmerie.name],
    objects: [dossier.name],
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
