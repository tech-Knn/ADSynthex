import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const prisma = new PrismaClient();

async function main() {
  const rl = readline.createInterface({ input, output });
  const email = await rl.question('User email: ');
  const username = await rl.question('User username: ');
  const password = await rl.question('User password: ');
  const accountCid = await rl.question('Account CID to allocate (e.g. 8701280199): ');
  rl.close();

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'user', status: 'active', passwordHash, approvedAt: new Date() },
    create: {
      email,
      username,
      passwordHash,
      role: 'user',
      status: 'active',
      approvedAt: new Date(),
    },
  });

  // Close any existing open allocation for this account, then open a new one
  await prisma.allocation.updateMany({
    where: { accountCid, removedAt: null },
    data: { removedAt: new Date() },
  });

  await prisma.allocation.create({
    data: { userId: user.id, accountCid },
  });

  console.log(`User created: ${user.email}`);
  console.log(`Allocated account: ${accountCid}`);
}

main().finally(() => prisma.$disconnect());