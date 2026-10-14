'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Select, DatePicker, Button } from 'antd';
import { ReloadOutlined, ExportOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

export type FilterValues = {
  adsAccount: string;
  adsenseAccount: string;
  range: [Dayjs, Dayjs];
};

interface AccountOpt { cid: string; seq: number | null }

interface Props {
  value: FilterValues;
  onChange: (v: FilterValues) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  showExport?: boolean;
  loading?: boolean;
  scopeUserId?: string;
}

export default function FilterBar({
  value, onChange, onRefresh, onExport, showExport, loading, scopeUserId,
}: Props) {
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);

  useEffect(() => {
    const url = scopeUserId ? `/api/accounts/mine?scopeUserId=${scopeUserId}` : '/api/accounts/mine';
    fetch(url)
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts || []))
      .catch(() => setAccounts([]));
  }, [scopeUserId]);

  const adsOptions = useMemo(() => {
    const label = (a: AccountOpt) =>
      a.seq != null ? `androidadvices ${String(a.seq).padStart(2, '0')} (${a.cid})` : a.cid;
    return [
      { value: 'all', label: 'All AndroidAdvice Accounts' },
      ...accounts.map((a) => ({ value: a.cid, label: label(a) })),
    ];
  }, [accounts]);

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
          options={[{ value: 'androidadvice', label: 'AndroidAdvice' }]}
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
