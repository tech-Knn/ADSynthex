import { PrismaClient } from '@prisma/client';

// Next.js dev mode har save pe code reload karta hai. Bina is pattern ke,
// har reload pe ek naya PrismaClient (= naya DB connection) banta hai, aur
// Supabase ki connection limit bhar jaati hai. Isliye ek hi instance ko
// globalThis pe rakhte hain aur reuse karte hain.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query', 'error', 'warn'], // dev me queries dikhengi (helpful for learning)
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
