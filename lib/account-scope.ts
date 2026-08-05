import { prisma } from '@/lib/prisma';

/**
 * Returns the list of account CIDs a user is allowed to see.
 * Admin  → every active account (role-based).
 * User   → only accounts with an OPEN allocation row (allocation-based).
 */
export async function getAccountsForUser(
  userId: string,
  role: string,
): Promise<string[]> {
  if (role === 'admin') {
    const all = await prisma.account.findMany({
      where: { active: true },
      select: { cid: true },
    });
    return all.map((a) => a.cid);
  }

  const allocations = await prisma.allocation.findMany({
    where: { userId, removedAt: null },
    select: { accountCid: true },
  });
  return allocations.map((a) => a.accountCid);
}