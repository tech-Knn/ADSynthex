import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const prisma = new PrismaClient();

async function main() {
  const rl = readline.createInterface({ input, output });
  const email = await rl.question('Admin email: ');
  const username = await rl.question('Admin username: ');
  const password = await rl.question('Admin password: ');
  rl.close();

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'admin', status: 'active', passwordHash, approvedAt: new Date() },
    create: {
      email,
      username,
      passwordHash,
      role: 'admin',
      status: 'active',
      approvedAt: new Date(),
    },
  });

  // Seed the initial team code if none exists
  const code = 'TEAM-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  await prisma.appSetting.upsert({
    where: { key: 'team_code' },
    update: {},
    create: { key: 'team_code', value: code },
  });

  console.log(`Admin created: ${admin.email}`);
  console.log(`Team code: ${code}`);
}

main().finally(() => prisma.$disconnect());