import { prisma } from './prisma';
import { syncRange, type SyncResult } from './sync';

const FEED = 'androidadvice';

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
 */
export async function syncIncremental(): Promise<SyncResult> {
  const today = new Date();

  const state = await prisma.syncState.findUnique({ where: { feedName: FEED } });

  let from: Date;
  if (state?.lastSyncedDate) {
    from = addDays(new Date(state.lastSyncedDate), -OVERLAP_DAYS);
  } else {
    from = addDays(today, -FIRST_RUN_DAYS);
    console.log(`[SYNC_INC] First run — starting ${FIRST_RUN_DAYS} days back`);
  }

  const startDate = toYMD(from);
  const endDate = toYMD(today);

  console.log(`[SYNC_INC] Auto range: ${startDate} -> ${endDate}`);

  // running mark karo
  await prisma.syncState.upsert({
    where: { feedName: FEED },
    create: { feedName: FEED, status: 'running', lastRunAt: new Date() },
    update: { status: 'running', lastRunAt: new Date() },
  });

  try {
    const result = await syncRange(startDate, endDate);

    const ok = result.errors.length === 0;
    await prisma.syncState.update({
      where: { feedName: FEED },
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
      where: { feedName: FEED },
      data: { status: 'failed', message: String(err?.message || err), lastRunAt: new Date() },
    });
    throw err;
  }
}
