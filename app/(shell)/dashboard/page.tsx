'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Space, Spin } from 'antd';
import { ArrowRightOutlined, ExportOutlined, CalendarOutlined, DollarOutlined, LineChartOutlined, RiseOutlined, PieChartOutlined } from '@ant-design/icons';
import Link from 'next/link';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend, Title,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import FilterBar, { FilterValues, defaultRange } from '@/components/AppShell/FilterBar';
import Kpi, { fmtDayShort, fmtMoney, fmtPct } from '@/components/AppShell/Kpi';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Title);

type DayRow = { date: string; cost: number; revenue: number; profit: number; roi: number };

interface SummaryResponse {
  summary: { cost: number; revenue: number; profit: number; roi: number };
  byDay: DayRow[];
  delta: { cost: number | null; revenue: number | null; profit: number | null; roi: number | null };
}

export default function DashboardPage() {
  const [filters, setFilters] = useState<FilterValues>({
    adsAccount: 'all',
    adsenseAccount: 'androidadvice',
    range: defaultRange(),
  });
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const [start, end] = filters.range;
      const url = new URL('/api/dash/summary', window.location.origin);
      url.searchParams.set('startDate', start.format('YYYY-MM-DD'));
      url.searchParams.set('endDate', end.format('YYYY-MM-DD'));
      url.searchParams.set('account', filters.adsAccount);
      const res = await fetch(url.toString());
      const json: SummaryResponse = await res.json();
      if (id === seq.current) setData(json);
    } catch (e) {
      if (id === seq.current) setData(null);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const chartData = buildChartData(data?.byDay || []);

  return (
    <div>
      <div className="page-head">
        <h1>Revenue &amp; Cost Dashboard</h1>
        <p>Track your performance across Google Ads and AdSense in one place</p>
      </div>

      <FilterBar value={filters} onChange={setFilters} onRefresh={load} loading={loading} />

      <div className="kpi-grid">
        <Kpi label="Total Cost" tone="red"
          value={fmtMoney(data?.summary.cost ?? 0)}
          delta={data?.delta.cost ?? null} invertDelta
          icon={<CalendarOutlined />}
        />
        <Kpi label="Total Revenue" tone="green"
          value={fmtMoney(data?.summary.revenue ?? 0)}
          delta={data?.delta.revenue ?? null}
          icon={<DollarOutlined />}
        />
        <Kpi label="Total Profit" tone="purple"
          value={fmtMoney(data?.summary.profit ?? 0)}
          delta={data?.delta.profit ?? null}
          icon={<LineChartOutlined />}
        />
        <Kpi label="ROI" tone="blue"
          value={fmtPct(data?.summary.roi ?? 0)}
          delta={data?.delta.roi ?? null}
          icon={<RiseOutlined />}
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="panel-title-wrap">
            <span className="panel-title-icon"><PieChartOutlined /></span>
            <div>
              <div className="panel-title">By Day</div>
              <div className="panel-sub">Daily cost, revenue, profit and ROI for the selected period</div>
            </div>
          </div>
          <Space>
            <Button
              icon={<ExportOutlined />}
              onClick={() => exportCsv(data?.byDay || [])}
            >
              Export
            </Button>
            <Link href="/dashboard/breakdown">
              <Button type="default" iconPosition="end" icon={<ArrowRightOutlined />}>
                View Details
              </Button>
            </Link>
          </Space>
        </div>

        <div className="chart-wrap">
          {loading && !data ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin />
            </div>
          ) : (
            <Chart type="bar" data={chartData.data as any} options={chartData.options as any} />
          )}
        </div>
      </div>
    </div>
  );
}

function exportCsv(byDay: DayRow[]) {
  const header = ['Date', 'Cost', 'Revenue', 'Profit', 'ROI (%)'];
  const lines = [header.join(',')];
  for (const d of byDay) {
    lines.push([d.date, d.cost.toFixed(2), d.revenue.toFixed(2), d.profit.toFixed(2), d.roi.toFixed(2)].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `by-day-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildChartData(byDay: DayRow[]) {
  const labels = byDay.map((d) => fmtDayShort(d.date));
  const cost = byDay.map((d) => +d.cost.toFixed(2));
  const revenue = byDay.map((d) => +d.revenue.toFixed(2));
  const profit = byDay.map((d) => +d.profit.toFixed(2));
  const roi = byDay.map((d) => +d.roi.toFixed(2));

  return {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Cost', data: cost, backgroundColor: '#ef4444', borderRadius: 4, barThickness: 10, yAxisID: 'y' },
        { type: 'bar', label: 'Revenue', data: revenue, backgroundColor: '#10b981', borderRadius: 4, barThickness: 10, yAxisID: 'y' },
        { type: 'bar', label: 'Profit', data: profit, backgroundColor: '#a78bfa', borderRadius: 4, barThickness: 10, yAxisID: 'y' },
        {
          type: 'line', label: 'ROI (%)', data: roi,
          borderColor: '#3b82f6', backgroundColor: '#3b82f6',
          pointRadius: 3, pointBackgroundColor: '#3b82f6',
          tension: 0.35, yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' as const },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: { usePointStyle: true, pointStyle: 'circle', color: '#334155' },
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const label = ctx.dataset.label || '';
              const v = ctx.parsed.y;
              if (label.includes('ROI')) return `${label}: ${v.toFixed(2)}%`;
              return `${label}: $${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Amount ($)', color: '#64748b' },
          ticks: { color: '#64748b', callback: (v: any) => `${v}` },
          grid: { color: '#eef2f7' },
        },
        y1: {
          beginAtZero: true,
          position: 'right' as const,
          title: { display: true, text: 'ROI (%)', color: '#64748b' },
          ticks: { color: '#64748b', callback: (v: any) => `${v}%` },
          grid: { display: false },
        },
        x: {
          grid: { display: false },
          ticks: { color: '#64748b' },
        },
      },
    },
  };
}
