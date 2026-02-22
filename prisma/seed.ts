import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const BCRYPT_ROUNDS = 10

async function main() {
  const existing = await prisma.catalog.findFirst({ where: { isMaster: true } })
  if (!existing) {
    await prisma.catalog.create({
      data: {
        name: 'Master Catalog',
        description: 'Master product catalog',
        isMaster: true,
      },
    })
    console.log('Created Master Catalog')
  } else {
    console.log('Master Catalog already exists')
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (adminEmail && adminPassword && adminPassword.length >= 8) {
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS)
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          firstName: 'Admin',
          lastName: 'User',
          role: 'ADMIN',
        },
      })
      console.log('Created seed admin user:', adminEmail)
    } else {
      console.log('Seed admin user already exists:', adminEmail)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
