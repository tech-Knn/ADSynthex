/**
 * Centralized account display label.
 * Feed-aware so Founderzest accounts don't show up as "androidadvices NN".
 */

const FEED_LABEL_PREFIX: Record<string, string> = {
  androidadvice: 'androidadvices',
  founderzest: 'fdz',
};

export function formatAccountLabel(
  cid: string,
  seq: number | null | undefined,
  feedName: string | null | undefined,
): string {
  if (seq == null) return cid;
  const prefix = (feedName && FEED_LABEL_PREFIX[feedName]) || feedName || 'account';
  return `${prefix} ${String(seq).padStart(2, '0')} (${cid})`;
}
