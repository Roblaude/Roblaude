import { PrismaClient } from '@prisma/client'

// singleton — pas de nouvelle instance à chaque import
const prisma = new PrismaClient()

export default prisma
