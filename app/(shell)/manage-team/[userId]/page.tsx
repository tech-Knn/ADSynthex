'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { App, Button, Input, InputNumber, Select, Switch, Table, Dropdown, Spin, Tabs, Tooltip } from 'antd';
import {
  ArrowLeftOutlined, CalendarOutlined, DollarOutlined, LineChartOutlined, RiseOutlined,
  SearchOutlined, DownOutlined, RightOutlined, MoreOutlined,
  ExpandAltOutlined, ShrinkOutlined, AimOutlined,
} from '@ant-design/icons';
import FilterBar, { FilterValues, defaultRange } from '@/components/AppShell/FilterBar';
import Kpi, { fmtDate, fmtInt, fmtMoney, fmtPct } from '@/components/AppShell/Kpi';
import { formatAccountLabel } from '@/lib/account-label';

type DayAcc = { date: string; cost: number; revenue: number; profit: number; roi: number; conversions: number };
type Account = {
  accountCid: string; campaigns: number;
  cost: number; revenue: number; profit: number; roi: number; conversions: number;
  daily: DayAcc[];
};

type DayCamp = { date: string; cost: number; revenue: number; profit: number; roi: number; clicks: number; conversions: number };
type Campaign = {
  campaignId: string; campaignName: string; styleId: string; country: string; accountCid: string;
  status: string;
  cost: number; revenue: number; profit: number; roi: number;
  clicks: number; conversions: number; cpa: number; rpc: number;
  daily: DayCamp[];
};

type AccountMeta = { cid: string; seq: number | null; feedName?: string };
type UserInfo = {
  id: string; email: string; username: string | null;
  role: 'admin' | 'user'; status: string;
};

export default function UserPerformancePage() {
  const { message } = App.useApp();
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params.userId;
  const [user, setUser] = useState<UserInfo | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [budgetByCampaign, setBudgetByCampaign] = useState<Record<string, { dailyAmountUsd: number; isShared: boolean }>>({});
  const [budgetsLoading, setBudgetsLoading] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, number | null>>({});
  const [budgetSavingKey, setBudgetSavingKey] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterValues>({
    adsAccount: 'all', adsenseAccount: 'androidadvice', range: defaultRange(),
  });
  const [summary, setSummary] = useState<{ cost: number; revenue: number; profit: number; roi: number; adsenseClicks: number } | null>(null);
  const [delta, setDelta] = useState<{ cost: number | null; revenue: number | null; profit: number | null; roi: number | null } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [meta, setMeta] = useState<Record<string, AccountMeta>>({});
  const [loading, setLoading] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignSortBy, setCampaignSortBy] = useState<'budget' | 'cost' | 'revenue' | 'profit' | 'roi' | 'cpa' | 'rpc' | 'conversions' | 'clicks'>('cost');
  const [campaignOrder, setCampaignOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedAccounts, setExpandedAccounts] = useState<React.Key[]>([]);
  const [expandedCampaigns, setExpandedCampaigns] = useState<React.Key[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    fetch(`/api/team/${userId}`)
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => setUser(null));
    fetch(`/api/accounts/mine?scopeUserId=${userId}`)
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, AccountMeta> = {};
        for (const a of d.accounts || []) map[a.cid] = a;
        setMeta(map);
      })
      .catch(() => setMeta({}));
  }, [userId]);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const [start, end] = filters.range;
      const qs = new URLSearchParams({
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        account: filters.adsAccount,
        scopeUserId: userId,
      });
      const [sumRes, accRes, campRes] = await Promise.all([
        fetch(`/api/dash/summary?${qs.toString()}`).then((r) => r.json()),
        fetch(`/api/dash/accounts-daily?${qs.toString()}`).then((r) => r.json()),
        fetch(`/api/dash/campaigns-daily?${qs.toString()}`).then((r) => r.json()),
      ]);
      if (id === seq.current) {
        setSummary(sumRes.summary || null);
        setDelta(sumRes.delta || null);
        setAccounts(accRes.accounts || []);
        setCampaigns(campRes.campaigns || []);
      }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [filters, userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const accountCids = Array.from(new Set(campaigns.map((c) => c.accountCid)));
    if (accountCids.length === 0) { setBudgetByCampaign({}); return; }
    let cancelled = false;
    setBudgetsLoading(true);
    fetch(`/api/campaigns/budgets?accountCids=${accountCids.join(',')}`)
      .then((r) => (r.ok ? r.json() : { budgets: {} }))
      .then((data) => {
        if (cancelled) return;
        const flat: Record<string, { dailyAmountUsd: number; isShared: boolean }> = {};
        for (const [cid, byCampaign] of Object.entries(data.budgets || {})) {
          for (const [campaignId, info] of Object.entries(byCampaign as Record<string, any>)) {
            flat[`${cid}:${campaignId}`] = info;
          }
        }
        setBudgetByCampaign(flat);
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setBudgetsLoading(false); });
    return () => { cancelled = true; };
  }, [campaigns]);

  const toggleStatus = async (row: Campaign) => {
    const nextStatus = row.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    const key = `${row.accountCid}::${row.campaignId}`;
    setTogglingId(key);
    setCampaigns((prev) => prev.map((c) =>
      c.accountCid === row.accountCid && c.campaignId === row.campaignId ? { ...c, status: nextStatus } : c,
    ));
    try {
      const res = await fetch('/api/campaigns/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountCid: row.accountCid, campaignId: row.campaignId, status: nextStatus }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { }
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      message.success(`${nextStatus === 'PAUSED' ? 'Paused' : 'Resumed'} on Google Ads`);
    } catch (e: any) {
      setCampaigns((prev) => prev.map((c) =>
        c.accountCid === row.accountCid && c.campaignId === row.campaignId ? { ...c, status: row.status } : c,
      ));
      message.error(e.message || 'Update failed');
    } finally {
      setTogglingId(null);
    }
  };

  const commitBudget = async (row: Campaign) => {
    const key = `${row.accountCid}:${row.campaignId}`;
    const draft = budgetDraft[key];
    const current = budgetByCampaign[key]?.dailyAmountUsd ?? null;
    if (draft == null || current == null || Math.abs(draft - current) < 0.005) {
      setBudgetDraft((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }
    if (!isFinite(draft) || draft < 1 || draft > 10000) {
      message.error('Enter a daily budget between $1 and $10,000');
      setBudgetDraft((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }
    setBudgetSavingKey(key);
    try {
      const res = await fetch('/api/campaigns/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountCid: row.accountCid, campaignId: row.campaignId, dailyBudget: Number(draft.toFixed(2)) }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { }
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      const info = budgetByCampaign[key];
      message.success(data.isShared
        ? `Shared budget updated to $${draft.toFixed(2)}/day (affects other campaigns)`
        : `Budget updated to $${draft.toFixed(2)}/day`);
      setBudgetByCampaign((prev) => ({
        ...prev,
        [key]: { dailyAmountUsd: draft, isShared: info?.isShared ?? data.isShared ?? false },
      }));
      setBudgetDraft((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } catch (e: any) {
      message.error(e.message || 'Update failed');
      setBudgetDraft((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } finally {
      setBudgetSavingKey(null);
    }
  };

  const label = (cid: string) => {
    const m = meta[cid];
    return formatAccountLabel(cid, m?.seq ?? null, m?.feedName);
  };

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => label(a.accountCid).toLowerCase().includes(q));
  }, [accounts, accountSearch, meta]);

  const filteredCampaigns = useMemo(() => {
    const q = campaignSearch.trim().toLowerCase();
    const rows = campaigns.filter((c) =>
      !q ||
      c.campaignName.toLowerCase().includes(q) ||
      c.styleId.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q),
    );
    const dir = campaignOrder === 'desc' ? -1 : 1;
    const val = (c: Campaign): number =>
      campaignSortBy === 'budget'
        ? (budgetByCampaign[`${c.accountCid}:${c.campaignId}`]?.dailyAmountUsd ?? 0)
        : ((c as any)[campaignSortBy] as number);
    rows.sort((a, b) => dir * (val(a) - val(b)));
    return rows;
  }, [campaigns, campaignSearch, campaignSortBy, campaignOrder, budgetByCampaign]);

  const accountCols = [
    {
      title: 'Account', dataIndex: 'accountCid',
      render: (cid: string) => <span style={{ fontWeight: 500, color: '#0f172a' }}>{label(cid)}</span>
    },
    { title: 'Campaigns', dataIndex: 'campaigns', align: 'right' as const, width: 110 },
    { title: 'Cost', dataIndex: 'cost', align: 'right' as const, width: 130, render: (v: number) => <span className="m-cost">{fmtMoney(v)}</span> },
    { title: 'Revenue', dataIndex: 'revenue', align: 'right' as const, width: 130, render: (v: number) => <span className="m-rev">{fmtMoney(v)}</span> },
    { title: 'Profit', dataIndex: 'profit', align: 'right' as const, width: 130, render: (v: number) => <span className="m-profit" style={{ color: v < 0 ? '#ef4444' : '#10b981' }}>{fmtMoney(v)}</span> },
    { title: 'ROI', dataIndex: 'roi', align: 'right' as const, width: 100, render: (v: number) => <span className="m-roi" style={{ color: v < 0 ? '#ef4444' : '#10b981' }}>{fmtPct(v)}</span> },
    { title: 'Conversions', dataIndex: 'conversions', align: 'right' as const, width: 130, render: (v: number) => fmtInt(v) },
    {
      title: 'Actions', width: 70, align: 'center' as const,
      render: (_: any, row: Account) => (
        <Dropdown menu={{ items: [{ key: 'export', label: 'Export CSV', onClick: () => exportAccounts([row], label) }] }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      )
    },
  ];

  const campaignCols = [
    { title: 'Campaign', dataIndex: 'campaignName', render: (v: string) => <span style={{ fontWeight: 500, color: '#0f172a' }}>{v}</span> },
    { title: 'Style ID', dataIndex: 'styleId', width: 120, render: (v: string) => <span className="m-muted">{v}</span> },
    { title: 'Country', dataIndex: 'country', width: 100, render: (v: string) => <span className="m-muted">{v}</span> },
    {
      title: 'Status', dataIndex: 'status', width: 100, align: 'center' as const,
      render: (_: string, row: Campaign) => {
        const key = `${row.accountCid}::${row.campaignId}`;
        const isToggling = togglingId === key;
        const checked = row.status === 'ENABLED';
        if (row.status === 'REMOVED') return <span className="status-pill inactive">removed</span>;
        return (
          <Tooltip title={checked ? 'Click to pause on Google Ads' : 'Click to resume on Google Ads'}>
            <Switch size="small" checked={checked} loading={isToggling} onChange={() => toggleStatus(row)} />
          </Tooltip>
        );
      },
    },
    {
      title: 'Budget', width: 130, align: 'right' as const,
      render: (_: any, row: Campaign) => {
        const key = `${row.accountCid}:${row.campaignId}`;
        const info = budgetByCampaign[key];
        if (!info) return budgetsLoading ? <span className="m-muted">…</span> : <span className="m-muted">—</span>;
        const draft = budgetDraft[key];
        const displayValue = draft ?? Number(info.dailyAmountUsd.toFixed(2));
        const isSaving = budgetSavingKey === key;
        return (
          <Tooltip title={info.isShared ? 'Shared budget — changes affect other campaigns using it' : 'Edit daily budget (saves on blur / Enter)'}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <InputNumber
                value={displayValue}
                size="small"
                min={1}
                max={10000}
                step={1}
                precision={2}
                prefix="$"
                controls={false}
                disabled={isSaving}
                onChange={(v) => setBudgetDraft((prev) => ({ ...prev, [key]: v == null ? null : Number(v) }))}
                onPressEnter={(e) => { (e.target as HTMLInputElement).blur(); }}
                onBlur={() => commitBudget(row)}
                style={{ width: 92 }}
              />
              {info.isShared && <span style={{ fontSize: 11, color: '#f59e0b' }} title="Shared budget">⚠</span>}
              {isSaving && <Spin size="small" />}
            </div>
          </Tooltip>
        );
      },
    },
    { title: 'Cost', dataIndex: 'cost', align: 'right' as const, width: 110, render: (v: number) => <span className="m-cost">{fmtMoney(v)}</span> },
    { title: 'Revenue', dataIndex: 'revenue', align: 'right' as const, width: 110, render: (v: number) => <span className="m-rev">{fmtMoney(v)}</span> },
    { title: 'Profit', dataIndex: 'profit', align: 'right' as const, width: 110, render: (v: number) => <span className="m-profit" style={{ color: v < 0 ? '#ef4444' : '#10b981' }}>{fmtMoney(v)}</span> },
    { title: 'ROI', dataIndex: 'roi', align: 'right' as const, width: 90, render: (v: number) => <span className="m-roi" style={{ color: v < 0 ? '#ef4444' : '#10b981' }}>{fmtPct(v)}</span> },
    { title: 'CPA', dataIndex: 'cpa', align: 'right' as const, width: 90, render: (v: number) => <span className="m-muted">{fmtMoney(v)}</span> },
    { title: 'RPC', dataIndex: 'rpc', align: 'right' as const, width: 90, render: (v: number) => <span className="m-muted">{fmtMoney(v)}</span> },
    { title: 'Conv.', dataIndex: 'conversions', align: 'right' as const, width: 90, render: (v: number) => fmtInt(v) },
    { title: 'Clicks', dataIndex: 'clicks', align: 'right' as const, width: 90, render: (v: number) => fmtInt(v) },
    {
      title: 'Actions', width: 70, align: 'center' as const,
      render: (_: any, row: Campaign) => (
        <Dropdown menu={{ items: [{ key: 'export', label: 'Export CSV', onClick: () => exportCampaigns([row]) }] }} trigger={['click']}>
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      )
    },
  ];

  return (
    <div>
      <div className="page-head" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/manage-team')} />
          <div>
            <h1>{user?.username || user?.email || 'User'}</h1>
            <p>{user?.email}{user?.role ? ` · ${user.role}` : ''}{user?.status ? ` · ${user.status}` : ''}</p>
          </div>
        </div>
      </div>

      <FilterBar
        value={filters} onChange={setFilters} onRefresh={load}
        onExport={() => exportCampaigns(filteredCampaigns)} showExport loading={loading}
        scopeUserId={userId}
      />

      <div className="kpi-grid cols-5">
        <Kpi label="Total Cost" tone="red" value={fmtMoney(summary?.cost ?? 0)} delta={delta?.cost ?? null} invertDelta icon={<CalendarOutlined />} />
        <Kpi label="Total Revenue" tone="green" value={fmtMoney(summary?.revenue ?? 0)} delta={delta?.revenue ?? null} icon={<DollarOutlined />} />
        <Kpi label="Total Profit" tone="purple" value={fmtMoney(summary?.profit ?? 0)} delta={delta?.profit ?? null} icon={<LineChartOutlined />} />
        <Kpi label="ROI" tone="blue" value={fmtPct(summary?.roi ?? 0)} delta={delta?.roi ?? null} icon={<RiseOutlined />} />
        <Kpi label="AdSense Clicks" tone="indigo" value={fmtInt(summary?.adsenseClicks ?? 0)} icon={<AimOutlined />} />
      </div>

      <Tabs
        defaultActiveKey="accounts"
        items={[
          {
            key: 'accounts',
            label: 'Accounts',
            children: (
              <div className="panel">
                <div className="table-toolbar">
                  <div className="toolbar-left">
                    <Input placeholder="Search account name..." prefix={<SearchOutlined />} allowClear
                      value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} />
                  </div>
                  <div className="toolbar-right">
                    <Button icon={<ExpandAltOutlined />} onClick={() => setExpandedAccounts(filteredAccounts.map((a) => a.accountCid))}>Expand All</Button>
                    <Button icon={<ShrinkOutlined />} onClick={() => setExpandedAccounts([])}>Collapse All</Button>
                  </div>
                </div>
                <Table
                  className="breakdown-table"
                  rowKey="accountCid"
                  loading={loading}
                  dataSource={filteredAccounts}
                  columns={accountCols as any}
                  pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], locale: { items_per_page: '/ page' }, showTotal: (total, range) => `Showing ${range[0]} to ${range[1]} of ${total} accounts` }}
                  expandable={{
                    expandedRowKeys: expandedAccounts,
                    onExpandedRowsChange: (keys) => setExpandedAccounts(keys as React.Key[]),
                    expandIcon: ({ expanded, onExpand, record }) =>
                      expanded
                        ? <DownOutlined onClick={(e) => onExpand(record, e)} style={{ color: '#6366f1' }} />
                        : <RightOutlined onClick={(e) => onExpand(record, e)} />,
                    expandedRowRender: (record: Account) => <DailyAccountRows daily={record.daily} />,
                  }}
                />
              </div>
            ),
          },
          {
            key: 'campaigns',
            label: 'Campaigns',
            children: (
              <div className="panel">
                <div className="table-toolbar">
                  <div className="toolbar-left">
                    <Input placeholder="Search campaign name, style ID, or country..." prefix={<SearchOutlined />} allowClear
                      value={campaignSearch} onChange={(e) => setCampaignSearch(e.target.value)} />
                  </div>
                  <div className="toolbar-right">
                    <Button icon={<ExpandAltOutlined />} onClick={() => setExpandedCampaigns(filteredCampaigns.map((c) => `${c.accountCid}::${c.campaignId}`))}>Expand All</Button>
                    <Button icon={<ShrinkOutlined />} onClick={() => setExpandedCampaigns([])}>Collapse All</Button>
                    <div className="filter-field" style={{ minWidth: 140 }}>
                      <label>Sort By</label>
                      <Select
                        value={campaignSortBy}
                        onChange={(v) => setCampaignSortBy(v)}
                        options={[
                          { value: 'budget', label: 'Budget' },
                          { value: 'cost', label: 'Cost' },
                          { value: 'revenue', label: 'Revenue' },
                          { value: 'profit', label: 'Profit' },
                          { value: 'roi', label: 'ROI' },
                          { value: 'cpa', label: 'CPA' },
                          { value: 'rpc', label: 'RPC' },
                          { value: 'conversions', label: 'Conversions' },
                          { value: 'clicks', label: 'Clicks' },
                        ]}
                        style={{ width: 140 }}
                      />
                    </div>
                    <div className="filter-field" style={{ minWidth: 150 }}>
                      <label>Order</label>
                      <Select
                        value={campaignOrder}
                        onChange={(v) => setCampaignOrder(v as 'asc' | 'desc')}
                        options={[
                          { value: 'desc', label: 'Highest First' },
                          { value: 'asc', label: 'Lowest First' },
                        ]}
                        style={{ width: 150 }}
                      />
                    </div>
                  </div>

                </div>
                <Table
                  className="breakdown-table"
                  rowKey={(r) => `${r.accountCid}::${r.campaignId}`}
                  loading={loading}
                  dataSource={filteredCampaigns}
                  columns={campaignCols as any}
                  pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '25', '50'], locale: { items_per_page: '/ page' }, showTotal: (total, range) => `Showing ${range[0]} to ${range[1]} of ${total} campaigns` }}
                  expandable={{
                    expandedRowKeys: expandedCampaigns,
                    onExpandedRowsChange: (keys) => setExpandedCampaigns(keys as React.Key[]),
                    expandIcon: ({ expanded, onExpand, record }) =>
                      expanded
                        ? <DownOutlined onClick={(e) => onExpand(record, e)} style={{ color: '#6366f1' }} />
                        : <RightOutlined onClick={(e) => onExpand(record, e)} />,
                    expandedRowRender: (record: Campaign) => <DailyCampaignRows daily={record.daily} />,
                  }}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function DailyAccountRows({ daily }: { daily: DayAcc[] }) {
  return (
    <Table size="small" showHeader={false} pagination={false} rowKey="date"
      dataSource={daily}
      columns={[
        { dataIndex: 'date', render: (d: string) => <span style={{ color: '#64748b' }}>{fmtDate(d)}</span> },
        { width: 110, align: 'right' as const, render: () => <span className="m-muted">—</span> },
        { dataIndex: 'cost', width: 130, align: 'right' as const, render: (v: number) => <span className="m-cost">{fmtMoney(v)}</span> },
        { dataIndex: 'revenue', width: 130, align: 'right' as const, render: (v: number) => <span className="m-rev">{fmtMoney(v)}</span> },
        { dataIndex: 'profit', width: 130, align: 'right' as const, render: (v: number) => <span className="m-profit" style={{ color: v < 0 ? '#ef4444' : '#10b981' }}>{fmtMoney(v)}</span> },
        { dataIndex: 'roi', width: 100, align: 'right' as const, render: (v: number) => <span className="m-roi" style={{ color: v < 0 ? '#ef4444' : '#10b981' }}>{fmtPct(v)}</span> },
        { dataIndex: 'conversions', width: 130, align: 'right' as const, render: (v: number) => fmtInt(v) },
        { width: 70 },
      ]} />
  );
}

function DailyCampaignRows({ daily }: { daily: DayCamp[] }) {
  return (
    <Table size="small" showHeader={false} pagination={false} rowKey="date"
      dataSource={daily}
      columns={[
        { dataIndex: 'date', render: (d: string) => <span style={{ color: '#64748b' }}>{fmtDate(d)}</span> },
        { width: 120, align: 'right' as const, render: () => <span className="m-muted">—</span> },
        { width: 100, align: 'right' as const, render: () => <span className="m-muted">—</span> },
        { dataIndex: 'cost', width: 110, align: 'right' as const, render: (v: number) => <span className="m-cost">{fmtMoney(v)}</span> },
        { dataIndex: 'revenue', width: 110, align: 'right' as const, render: (v: number) => <span className="m-rev">{fmtMoney(v)}</span> },
        { dataIndex: 'profit', width: 110, align: 'right' as const, render: (v: number) => <span className="m-profit" style={{ color: v < 0 ? '#ef4444' : '#10b981' }}>{fmtMoney(v)}</span> },
        { dataIndex: 'roi', width: 90, align: 'right' as const, render: (v: number) => <span className="m-roi" style={{ color: v < 0 ? '#ef4444' : '#10b981' }}>{fmtPct(v)}</span> },
        { width: 90, align: 'right' as const, render: () => <span className="m-muted">—</span> },
        { width: 90, align: 'right' as const, render: () => <span className="m-muted">—</span> },
        { dataIndex: 'conversions', width: 90, align: 'right' as const, render: (v: number) => fmtInt(v) },
        { dataIndex: 'clicks', width: 90, align: 'right' as const, render: (v: number) => fmtInt(v) },
        { width: 70 },
      ]} />
  );
}

function exportAccounts(accounts: Account[], label: (cid: string) => string) {
  const header = ['Account', 'Date', 'Cost', 'Revenue', 'Profit', 'ROI (%)', 'Conversions'];
  const lines = [header.join(',')];
  for (const a of accounts) {
    for (const d of a.daily) {
      lines.push([`"${label(a.accountCid)}"`, d.date, d.cost.toFixed(2), d.revenue.toFixed(2), d.profit.toFixed(2), d.roi.toFixed(2), d.conversions.toFixed(0)].join(','));
    }
  }
  download(lines.join('\n'), `user-accounts-${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportCampaigns(campaigns: Campaign[]) {
  const header = ['Campaign', 'Style ID', 'Country', 'Date', 'Cost', 'Revenue', 'Profit', 'ROI (%)', 'Clicks', 'Conversions'];
  const lines = [header.join(',')];
  for (const c of campaigns) {
    for (const d of c.daily) {
      lines.push([`"${c.campaignName.replace(/"/g, '""')}"`, c.styleId, c.country, d.date, d.cost.toFixed(2), d.revenue.toFixed(2), d.profit.toFixed(2), d.roi.toFixed(2), d.clicks.toFixed(0), d.conversions.toFixed(0)].join(','));
    }
  }
  download(lines.join('\n'), `user-campaigns-${new Date().toISOString().slice(0, 10)}.csv`);
}

function download(text: string, name: string) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
