import { prisma } from './prisma';
import { registerAccountMCC, resolveMccKeyForFeed } from './mcc-config';

/**
 * Load every (cid, feedName) from the DB and populate the dynamic MCC
 * cache so getMCCForAccount() can route cids that aren't in the static
 * ACCOUNT_TO_MCC dict. Idempotent and cheap — call at the start of a
 * sync batch and on any account-create.
 */
export async function warmDynamicMccCache(): Promise<number> {
  const rows = await prisma.account.findMany({
    where: { active: true },
    select: { cid: true, feedName: true },
  });
  let registered = 0;
  for (const r of rows) {
    const mccKey = resolveMccKeyForFeed(r.feedName);
    if (mccKey) {
      registerAccountMCC(r.cid, mccKey);
      registered++;
    }
  }
  return registered;
}
