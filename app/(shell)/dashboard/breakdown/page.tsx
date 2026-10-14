'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, Table, Button, Dropdown, Spin } from 'antd';
import {
  CalendarOutlined, DollarOutlined, LineChartOutlined, RiseOutlined,
  SearchOutlined, DownOutlined, RightOutlined, MoreOutlined, ExpandAltOutlined, ShrinkOutlined,
  QuestionCircleOutlined, AimOutlined,
} from '@ant-design/icons';
import FilterBar, { FilterValues, defaultRange, loadRange, saveRange } from '@/components/AppShell/FilterBar';
import Kpi, { fmtDate, fmtInt, fmtMoney, fmtPct } from '@/components/AppShell/Kpi';

type Daily = { date: string; cost: number; revenue: number; profit: number; roi: number; conversions: number };
type Account = {
  accountCid: string;
  campaigns: number;
  cost: number;
  revenue: number;
  profit: number;
  roi: number;
  conversions: number;
  daily: Daily[];
};

type AccountMeta = { cid: string; seq: number | null };

export default function BreakdownPage() {
  const [filters, setFilters] = useState<FilterValues>({
    adsAccount: 'all', adsenseAccount: 'androidadvice', range: defaultRange(),
  });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [meta, setMeta] = useState<Record<string, AccountMeta>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ cost: number; revenue: number; profit: number; roi: number; adsenseClicks: number; unattributedRevenue?: number } | null>(null);
  const [delta, setDelta] = useState<{ cost: number | null; revenue: number | null; profit: number | null; roi: number | null } | null>(null);
  const seq = useRef(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetch('/api/accounts/mine')
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, AccountMeta> = {};
        for (const a of d.accounts || []) map[a.cid] = a;
        setMeta(map);
      })
      .catch(() => setMeta({}));
  }, []);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const [start, end] = filters.range;
      const qs = new URLSearchParams({
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        account: filters.adsAccount,
      });
      const [accRes, sumRes] = await Promise.all([
        fetch(`/api/dash/accounts-daily?${qs.toString()}`).then((r) => r.json()),
        fetch(`/api/dash/summary?${qs.toString()}`).then((r) => r.json()),
      ]);
      if (id === seq.current) {
        setAccounts(accRes.accounts || []);
        setSummary(sumRes.summary || null);
        setDelta(sumRes.delta || null);
      }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => {
    const saved = loadRange();
    if (saved) setFilters((f) => ({ ...f, range: saved }));
  }, []);

  const label = (cid: string) => {
    const m = meta[cid];
    return m?.seq != null ? `androidadvices ${String(m.seq).padStart(2, '0')} (${cid})` : cid;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) => label(a.accountCid).toLowerCase().includes(q));
  }, [accounts, search, meta]);

  const expandAll = () => setExpandedKeys(filtered.map((a) => a.accountCid));
  const collapseAll = () => setExpandedKeys([]);

  const columns = [
    {
      title: 'Account',
      dataIndex: 'accountCid',
      render: (cid: string) => (
        <span style={{ fontWeight: 500, color: '#0f172a' }}>{label(cid)}</span>
      ),
      sorter: (a: Account, b: Account) => label(a.accountCid).localeCompare(label(b.accountCid)),
    },
    { title: 'Campaigns', dataIndex: 'campaigns', align: 'right' as const, width: 120, sorter: (a: Account, b: Account) => a.campaigns - b.campaigns },
    {
      title: 'Cost', dataIndex: 'cost', align: 'right' as const, width: 130,
      render: (v: number) => <span className="m-cost">{fmtMoney(v)}</span>,
      sorter: (a: Account, b: Account) => a.cost - b.cost
    },
    {
      title: 'Revenue', dataIndex: 'revenue', align: 'right' as const, width: 130,
      render: (v: number) => <span className="m-rev">{fmtMoney(v)}</span>,
      sorter: (a: Account, b: Account) => a.revenue - b.revenue
    },
    {
      title: 'Profit', dataIndex: 'profit', align: 'right' as const, width: 130,
      render: (v: number) => <span className="m-profit">{fmtMoney(v)}</span>,
      sorter: (a: Account, b: Account) => a.profit - b.profit
    },
    {
      title: 'ROI', dataIndex: 'roi', align: 'right' as const, width: 100,
      render: (v: number) => <span className="m-roi">{fmtPct(v)}</span>,
      sorter: (a: Account, b: Account) => a.roi - b.roi
    },
    {
      title: 'Conversions', dataIndex: 'conversions', align: 'right' as const, width: 130,
      render: (v: number) => fmtInt(v),
      sorter: (a: Account, b: Account) => a.conversions - b.conversions
    },
    {
      title: 'Actions', width: 80, align: 'center' as const,
      render: (_: any, row: Account) => (
        <Dropdown
          menu={{ items: [{ key: 'export', label: 'Export CSV', onClick: () => exportCsv([row], label) }] }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <h1>Date-wise Account Breakdown</h1>
        <p>View daily performance for each account</p>
      </div>

      <FilterBar
        value={filters} onChange={(v) => { setFilters(v); saveRange(v.range); }} onRefresh={load}
        onExport={() => exportCsv(filtered, label)} showExport loading={loading}
      />

      <div className={`kpi-grid ${summary?.unattributedRevenue !== undefined ? 'cols-6' : 'cols-5'}`}>
        <Kpi label="Total Cost" tone="red" value={fmtMoney(summary?.cost ?? 0)} delta={delta?.cost ?? null} invertDelta icon={<CalendarOutlined />} />
        <Kpi label="Total Revenue" tone="green" value={fmtMoney(summary?.revenue ?? 0)} delta={delta?.revenue ?? null} icon={<DollarOutlined />} />
        <Kpi label="Total Profit" tone="purple" value={fmtMoney(summary?.profit ?? 0)} delta={delta?.profit ?? null} icon={<LineChartOutlined />} />
        <Kpi label="ROI" tone="blue" value={fmtPct(summary?.roi ?? 0)} delta={delta?.roi ?? null} icon={<RiseOutlined />} />
        <Kpi label="AdSense Clicks" tone="indigo" value={fmtInt(summary?.adsenseClicks ?? 0)} icon={<AimOutlined />} />
        {summary?.unattributedRevenue !== undefined && (
          <Kpi label="Unattributed Rev" tone="indigo" value={fmtMoney(summary.unattributedRevenue)} icon={<QuestionCircleOutlined />} />
        )}
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <div className="toolbar-left">
            <Input
              placeholder="Search account name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefix={<SearchOutlined />}
              allowClear
            />
          </div>
          <div className="toolbar-right">
            <Button icon={<ExpandAltOutlined />} onClick={expandAll}>Expand All</Button>
            <Button icon={<ShrinkOutlined />} onClick={collapseAll}>Collapse All</Button>
          </div>
        </div>

        <Table
          className="breakdown-table"
          rowKey="accountCid"
          loading={loading}
          dataSource={filtered}
          columns={columns as any}
          pagination={{
            current: page,
            pageSize: pageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '25', '50'],
            locale: { items_per_page: '/ page' },
            showTotal: (total, range) => `Showing ${range[0]} to ${range[1]} of ${total} accounts`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            onShowSizeChange: (_, ps) => { setPage(1); setPageSize(ps); },
          }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
            expandIcon: ({ expanded, onExpand, record }) =>
              expanded
                ? <DownOutlined onClick={(e) => onExpand(record, e)} style={{ color: '#6a3de8' }} />
                : <RightOutlined onClick={(e) => onExpand(record, e)} />,
            expandedRowRender: (record: Account) => <DailyRows daily={record.daily} />,
          }}
        />
      </div>
    </div>
  );
}

function DailyRows({ daily }: { daily: Daily[] }) {
  return (
    <Table
      size="small"
      showHeader={false}
      pagination={false}
      rowKey="date"
      dataSource={daily}
      columns={[
        { dataIndex: 'date', render: (d: string) => <span style={{ color: '#64748b' }}>{fmtDate(d)}</span> },
        { width: 120, align: 'right' as const, render: () => <span className="m-muted">—</span> },
        { dataIndex: 'cost', width: 130, align: 'right' as const, render: (v: number) => <span className="m-cost">{fmtMoney(v)}</span> },
        { dataIndex: 'revenue', width: 130, align: 'right' as const, render: (v: number) => <span className="m-rev">{fmtMoney(v)}</span> },
        { dataIndex: 'profit', width: 130, align: 'right' as const, render: (v: number) => <span className="m-profit">{fmtMoney(v)}</span> },
        { dataIndex: 'roi', width: 100, align: 'right' as const, render: (v: number) => <span className="m-roi">{fmtPct(v)}</span> },
        { dataIndex: 'conversions', width: 130, align: 'right' as const, render: (v: number) => fmtInt(v) },
        { width: 80 },
      ]}
    />
  );
}

function exportCsv(accounts: Account[], label: (cid: string) => string) {
  const header = ['Account', 'Date', 'Cost', 'Revenue', 'Profit', 'ROI (%)', 'Conversions'];
  const lines = [header.join(',')];
  for (const a of accounts) {
    for (const d of a.daily) {
      lines.push([
        `"${label(a.accountCid)}"`,
        d.date,
        d.cost.toFixed(2),
        d.revenue.toFixed(2),
        d.profit.toFixed(2),
        d.roi.toFixed(2),
        d.conversions.toFixed(0),
      ].join(','));
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `account-breakdown-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
