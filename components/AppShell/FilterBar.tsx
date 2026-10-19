'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Select, DatePicker, Button } from 'antd';
import { ReloadOutlined, ExportOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { formatAccountLabel } from '@/lib/account-label';

export type FilterValues = {
  adsAccount: string;
  adsenseAccount: string;  // 'all' | '<feedName>' — the chosen feed
  range: [Dayjs, Dayjs];
};

interface AccountOpt { cid: string; seq: number | null; feedName?: string }
interface FeedOpt { feedName: string; publisherId: string | null }

interface Props {
  value: FilterValues;
  onChange: (v: FilterValues) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  showExport?: boolean;
  loading?: boolean;
  scopeUserId?: string;
}

const FEED_DISPLAY: Record<string, string> = {
  androidadvice: 'AndroidAdvice',
  founderzest: 'Founderzest',
};
const feedDisplayName = (f: string) => FEED_DISPLAY[f] || f;

export default function FilterBar({
  value, onChange, onRefresh, onExport, showExport, loading, scopeUserId,
}: Props) {
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [feeds, setFeeds] = useState<FeedOpt[]>([]);

  useEffect(() => {
    const url = scopeUserId ? `/api/accounts/mine?scopeUserId=${scopeUserId}` : '/api/accounts/mine';
    fetch(url)
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts || []))
      .catch(() => setAccounts([]));
    fetch('/api/feeds')
      .then((r) => r.json())
      .then((d) => setFeeds(d.feeds || []))
      .catch(() => setFeeds([]));
  }, [scopeUserId]);

  const feedOptions = useMemo(
    () => [
      { value: 'all', label: 'All Feeds' },
      ...feeds.map((f) => ({ value: f.feedName, label: feedDisplayName(f.feedName) })),
    ],
    [feeds],
  );

  // Google Ads account dropdown — scoped to the chosen feed if one is picked.
  const adsOptions = useMemo(() => {
    const scoped = value.adsenseAccount === 'all'
      ? accounts
      : accounts.filter((a) => a.feedName === value.adsenseAccount);
    return [
      { value: 'all', label: value.adsenseAccount === 'all'
        ? 'All Accounts'
        : `All ${feedDisplayName(value.adsenseAccount)} Accounts` },
      ...scoped.map((a) => ({ value: a.cid, label: formatAccountLabel(a.cid, a.seq, a.feedName) })),
    ];
  }, [accounts, value.adsenseAccount]);

  // If the user switches feeds and the current adsAccount no longer belongs to it, reset to 'all'.
  useEffect(() => {
    if (value.adsAccount === 'all') return;
    const stillValid = accounts.find((a) =>
      a.cid === value.adsAccount &&
      (value.adsenseAccount === 'all' || a.feedName === value.adsenseAccount),
    );
    if (!stillValid) onChange({ ...value, adsAccount: 'all' });
  }, [value.adsenseAccount, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="filter-bar">
      <div className="filter-field">
        <label>Google Ads Account</label>
        <Select
          value={value.adsAccount}
          options={adsOptions}
          onChange={(v) => onChange({ ...value, adsAccount: v })}
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
        />
      </div>
      <div className="filter-field">
        <label>AdSense Account</label>
        <Select
          value={value.adsenseAccount}
          options={feedOptions}
          onChange={(v) => onChange({ ...value, adsenseAccount: v })}
          style={{ width: '100%' }}
        />
      </div>
      <div className="filter-field">
        <label>&nbsp;</label>
        <DatePicker.RangePicker
          value={value.range}
          onChange={(v) => v && onChange({ ...value, range: v as [Dayjs, Dayjs] })}
          suffixIcon={<CalendarOutlined />}
          format="MMM D, YYYY"
          allowClear={false}
          presets={rangePresets()}
        />
      </div>
      <Button
        type="primary"
        icon={<ReloadOutlined />}
        onClick={onRefresh}
        loading={loading}
        className="btn-primary-gradient"
      >
        Refresh
      </Button>
      {showExport && (
        <Button icon={<ExportOutlined />} onClick={onExport}>
          Export
        </Button>
      )}
    </div>
  );
}

export function defaultRange(): [Dayjs, Dayjs] {
  const today = dayjs();
  return [today, today];
}

// --- Shared date range across Dashboard / Breakdown / Campaigns ---
// Stored as ISO day strings in sessionStorage so the selection carries
// across page navigation (and reloads within the same browser tab).
const RANGE_STORAGE_KEY = 'asx_date_range_v1';

export function saveRange(range: [Dayjs, Dayjs]): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      RANGE_STORAGE_KEY,
      JSON.stringify([range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')]),
    );
  } catch {
    /* sessionStorage unavailable — ignore */
  }
}

export function loadRange(): [Dayjs, Dayjs] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== 2) return null;
    const start = dayjs(arr[0]);
    const end = dayjs(arr[1]);
    if (!start.isValid() || !end.isValid()) return null;
    return [start, end];
  } catch {
    return null;
  }
}

function rangePresets(): { label: string; value: [Dayjs, Dayjs] }[] {
  const today = dayjs();
  const yesterday = today.subtract(1, 'day');
  return [
    { label: 'Today', value: [today, today] },
    { label: 'Yesterday', value: [yesterday, yesterday] },
    { label: 'Last 7 days', value: [today.subtract(6, 'day'), today] },
    { label: 'Last 30 days', value: [today.subtract(29, 'day'), today] },
    { label: 'Last 90 days', value: [today.subtract(89, 'day'), today] },
    { label: 'This month', value: [today.startOf('month'), today] },
    { label: 'Last month', value: [today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month')] },
  ];
}
