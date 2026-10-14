'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input, Select, Table, Button, Dropdown } from 'antd';
import {
  AppstoreOutlined, DollarOutlined, LineChartOutlined, RiseOutlined,
  SearchOutlined, DownOutlined, RightOutlined, MoreOutlined, CalendarOutlined,
  ExpandAltOutlined, ShrinkOutlined,
} from '@ant-design/icons';
import FilterBar, { FilterValues, defaultRange } from '@/components/AppShell/FilterBar';
import Kpi, { fmtDate, fmtInt, fmtMoney, fmtPct } from '@/components/AppShell/Kpi';

type Daily = { date: string; cost: number; revenue: number; profit: number; roi: number; clicks: number; conversions: number };
type Campaign = {
  campaignId: string; campaignName: string; styleId: string; country: string; accountCid: string;
  cost: number; revenue: number; profit: number; roi: number;
  clicks: number; conversions: number; cpa: number; rpc: number;
  daily: Daily[];
};

type SortKey = 'cost' | 'revenue' | 'profit' | 'roi' | 'clicks' | 'conversions';

export default function CampaignsPage() {
  const [filters, setFilters] = useState<FilterValues>({
    adsAccount: 'all', adsenseAccount: 'androidadvice', range: defaultRange(),
  });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('cost');
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const seq = useRef(0);

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
      const res = await fetch(`/api/dash/campaigns-daily?${qs.toString()}`).then((r) => r.json());
      if (id === seq.current) setCampaigns(res.campaigns || []);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const countryOpts = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => c.country && set.add(c.country));
    return [{ value: 'all', label: 'All' }, ...Array.from(set).map((c) => ({ value: c, label: c }))];
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = campaigns.filter((c) => {
      if (country !== 'all' && c.country !== country) return false;
      if (!q) return true;
      return (
        c.campaignName.toLowerCase().includes(q) ||
        c.styleId.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q)
      );
    });
    const dir = order === 'desc' ? -1 : 1;
    rows.sort((a, b) => dir * (a[sortBy] - b[sortBy]));
    return rows;
  }, [campaigns, search, country, sortBy, order]);

  const summary = useMemo(() => {
    const totals = filtered.reduce(
      (acc, c) => {
        acc.cost += c.cost; acc.revenue += c.revenue; acc.profit += c.profit;
        return acc;
      },
      { cost: 0, revenue: 0, profit: 0 },
    );
    const roi = totals.cost > 0 ? (totals.profit / totals.cost) * 100 : 0;
    return { count: filtered.length, ...totals, roi };
  }, [filtered]);

  const columns = [
    { title: 'Campaign', dataIndex: 'campaignName',
      render: (v: string) => <span style={{ fontWeight: 500, color: '#0f172a' }}>{v}</span> },
    { title: 'Style ID', dataIndex: 'styleId', width: 120, render: (v: string) => <span className="m-muted">{v}</span> },
    { title: 'Country', dataIndex: 'country', width: 100, render: (v: string) => <span className="m-muted">{v}</span> },
    { title: 'Cost', dataIndex: 'cost', align: 'right' as const, width: 110,
      render: (v: number) => <span className="m-cost">{fmtMoney(v)}</span> },
    { title: 'Revenue', dataIndex: 'revenue', align: 'right' as const, width: 110,
      render: (v: number) => <span className="m-rev">{fmtMoney(v)}</span> },
    { title: 'Profit', dataIndex: 'profit', align: 'right' as const, width: 110,
      render: (v: number) => <span className="m-profit">{fmtMoney(v)}</span> },
    { title: 'ROI', dataIndex: 'roi', align: 'right' as const, width: 90,
      render: (v: number) => <span className="m-roi">{fmtPct(v)}</span> },
    { title: 'CPA', dataIndex: 'cpa', align: 'right' as const, width: 90,
      render: (v: number) => <span className="m-muted">{fmtMoney(v)}</span> },
    { title: 'RPC', dataIndex: 'rpc', align: 'right' as const, width: 90,
      render: (v: number) => <span className="m-muted">{fmtMoney(v)}</span> },
    { title: 'Conv.', dataIndex: 'conversions', align: 'right' as const, width: 90,
      render: (v: number) => fmtInt(v) },
    { title: 'Clicks', dataIndex: 'clicks', align: 'right' as const, width: 90,
      render: (v: number) => fmtInt(v) },
    {
      title: 'Actions', width: 70, align: 'center' as const,
      render: (_: any, row: Campaign) => (
        <Dropdown
          menu={{ items: [{ key: 'export', label: 'Export CSV', onClick: () => exportCsv([row]) }] }}
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
        <h1>Campaign-wise Performance</h1>
        <p>View campaign performance with date-wise breakdown</p>
      </div>

      <FilterBar
        value={filters} onChange={setFilters} onRefresh={load}
        onExport={() => exportCsv(filtered)} showExport loading={loading}
      />

      <div className="kpi-grid cols-5">
        <Kpi label="Total Campaigns" tone="indigo" value={fmtInt(summary.count)} icon={<AppstoreOutlined />} />
        <Kpi label="Total Cost" tone="red" value={fmtMoney(summary.cost)} icon={<CalendarOutlined />} />
        <Kpi label="Total Revenue" tone="green" value={fmtMoney(summary.revenue)} icon={<DollarOutlined />} />
        <Kpi label="Total Profit" tone="purple" value={fmtMoney(summary.profit)} icon={<LineChartOutlined />} />
        <Kpi label="Avg. ROI" tone="blue" value={fmtPct(summary.roi)} icon={<RiseOutlined />} />
      </div>

      <div className="panel">
        <div className="table-toolbar">
          <div className="toolbar-left">
            <Input
              placeholder="Search campaign name, style ID, or country..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              prefix={<SearchOutlined />} allowClear
            />
          </div>
          <div className="toolbar-right">
            <Button
              icon={<ExpandAltOutlined />}
              onClick={() => setExpandedKeys(filtered.map((c) => `${c.accountCid}::${c.campaignId}`))}
            >
              Expand All
            </Button>
            <Button
              icon={<ShrinkOutlined />}
              onClick={() => setExpandedKeys([])}
            >
              Collapse All
            </Button>
            <div className="filter-field" style={{ minWidth: 160 }}>
              <label>Country</label>
              <Select value={country} options={countryOpts} onChange={setCountry} style={{ width: 160 }} />
            </div>
            <div className="filter-field" style={{ minWidth: 140 }}>
              <label>Sort By</label>
              <Select
                value={sortBy}
                onChange={(v) => setSortBy(v)}
                options={[
                  { value: 'cost', label: 'Cost' },
                  { value: 'revenue', label: 'Revenue' },
                  { value: 'profit', label: 'Profit' },
                  { value: 'roi', label: 'ROI' },
                  { value: 'clicks', label: 'Clicks' },
                  { value: 'conversions', label: 'Conversions' },
                ]}
                style={{ width: 140 }}
              />
            </div>
            <div className="filter-field" style={{ minWidth: 150 }}>
              <label>Order</label>
              <Select
                value={order}
                onChange={(v) => setOrder(v as 'asc' | 'desc')}
                options={[{ value: 'desc', label: 'Highest First' }, { value: 'asc', label: 'Lowest First' }]}
                style={{ width: 150 }}
              />
            </div>
          </div>
        </div>

        <Table
          className="breakdown-table"
          rowKey={(r) => `${r.accountCid}::${r.campaignId}`}
          loading={loading}
          dataSource={filtered}
          columns={columns as any}
          pagination={{ pageSize: 8, showSizeChanger: true, pageSizeOptions: ['8', '20', '50'], locale: { items_per_page: '/ page' }, showTotal: (total, range) => `Showing ${range[0]} to ${range[1]} of ${total} campaigns` }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys as React.Key[]),
            expandIcon: ({ expanded, onExpand, record }) =>
              expanded
                ? <DownOutlined onClick={(e) => onExpand(record, e)} style={{ color: '#6a3de8' }} />
                : <RightOutlined onClick={(e) => onExpand(record, e)} />,
            expandedRowRender: (record: Campaign) => <CampaignDaily daily={record.daily} />,
          }}
        />
      </div>
    </div>
  );
}

function CampaignDaily({ daily }: { daily: Daily[] }) {
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
        { width: 100, align: 'right' as const, render: () => <span className="m-muted">—</span> },
        { dataIndex: 'cost', width: 110, align: 'right' as const, render: (v: number) => <span className="m-cost">{fmtMoney(v)}</span> },
        { dataIndex: 'revenue', width: 110, align: 'right' as const, render: (v: number) => <span className="m-rev">{fmtMoney(v)}</span> },
        { dataIndex: 'profit', width: 110, align: 'right' as const, render: (v: number) => <span className="m-profit">{fmtMoney(v)}</span> },
        { dataIndex: 'roi', width: 90, align: 'right' as const, render: (v: number) => <span className="m-roi">{fmtPct(v)}</span> },
        { width: 90, align: 'right' as const, render: () => <span className="m-muted">—</span> },
        { width: 90, align: 'right' as const, render: () => <span className="m-muted">—</span> },
        { dataIndex: 'conversions', width: 90, align: 'right' as const, render: (v: number) => fmtInt(v) },
        { dataIndex: 'clicks', width: 90, align: 'right' as const, render: (v: number) => fmtInt(v) },
        { width: 70 },
      ]}
    />
  );
}

function exportCsv(campaigns: Campaign[]) {
  const header = ['Campaign', 'Style ID', 'Country', 'Date', 'Cost', 'Revenue', 'Profit', 'ROI (%)', 'Clicks', 'Conversions'];
  const lines = [header.join(',')];
  for (const c of campaigns) {
    for (const d of c.daily) {
      lines.push([
        `"${c.campaignName.replace(/"/g, '""')}"`,
        c.styleId, c.country, d.date,
        d.cost.toFixed(2), d.revenue.toFixed(2), d.profit.toFixed(2),
        d.roi.toFixed(2), d.clicks.toFixed(0), d.conversions.toFixed(0),
      ].join(','));
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `campaigns-breakdown-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
