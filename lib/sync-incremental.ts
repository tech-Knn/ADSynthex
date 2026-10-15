import { prisma } from './prisma';
import { syncRange, type SyncResult } from './sync';

// Late conversions ki wajah se thoda peeche se dobara fetch karte hain.
// Upsert hai, isliye purani rows sirf UPDATE hongi — duplicate nahi.
const OVERLAP_DAYS = 2;

// Pehli baar (sync_state khaali) — itne din peeche se shuru karo.
const FIRST_RUN_DAYS = 90;

function toYMD(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * Dates khud nikaal kar sync karta hai — manual date daalne ki zaroorat nahi.
 * Cron isse hi call karega.
 *
 * Iterates over every active feed and runs its own incremental sync.
 * Returns per-feed results so the caller can see which feed did what.
 */
export async function syncIncremental(): Promise<SyncResult[]> {
  const feeds = await prisma.feed.findMany({ where: { active: true }, select: { feedName: true } });
  if (feeds.length === 0) {
    console.warn('[SYNC_INC] No active feeds configured — nothing to sync');
    return [];
  }

  const results: SyncResult[] = [];
  for (const { feedName } of feeds) {
    try {
      results.push(await syncIncrementalForFeed(feedName));
    } catch (err: any) {
      console.error(`[SYNC_INC] Feed ${feedName} failed:`, err?.message || err);
      // Record a stub result so callers see every feed represented
      results.push({
        startDate: '', endDate: '',
        accountsProcessed: 0, campaignsUpserted: 0,
        adsDailyUpserted: 0, adsenseDailyUpserted: 0,
        durationMs: 0,
        errors: [String(err?.message || err)],
      });
    }
  }
  return results;
}

async function syncIncrementalForFeed(feedName: string): Promise<SyncResult> {
  const today = new Date();

  const state = await prisma.syncState.findUnique({ where: { feedName } });

  let from: Date;
  if (state?.lastSyncedDate) {
    from = addDays(new Date(state.lastSyncedDate), -OVERLAP_DAYS);
  } else {
    from = addDays(today, -FIRST_RUN_DAYS);
    console.log(`[SYNC_INC][${feedName}] First run — starting ${FIRST_RUN_DAYS} days back`);
  }

  const startDate = toYMD(from);
  const endDate = toYMD(today);

  console.log(`[SYNC_INC][${feedName}] Auto range: ${startDate} -> ${endDate}`);

  // running mark karo
  await prisma.syncState.upsert({
    where: { feedName },
    create: { feedName, status: 'running', lastRunAt: new Date() },
    update: { status: 'running', lastRunAt: new Date() },
  });

  try {
    const result = await syncRange(startDate, endDate, undefined, feedName);

    const ok = result.errors.length === 0;
    await prisma.syncState.update({
      where: { feedName },
      data: {
        // sirf tab aage badhao jab clean run ho
        lastSyncedDate: ok ? today : undefined,
        status: ok ? 'success' : 'partial',
        message: ok
          ? `ads=${result.adsDailyUpserted} adsense=${result.adsenseDailyUpserted}`
          : result.errors.slice(0, 3).join(' | '),
        lastRunAt: new Date(),
      },
    });

    return result;
  } catch (err: any) {
    await prisma.syncState.update({
      where: { feedName },
      data: { status: 'failed', message: String(err?.message || err), lastRunAt: new Date() },
    });
    throw err;
  }
}

/**
 * Backward-compat: sync a single feed by name. Used by anything that still
 * expects the single-feed signature.
 */
export async function syncIncrementalFeed(feedName: string): Promise<SyncResult> {
  return syncIncrementalForFeed(feedName);
}
