'use client';

import React, { ReactNode } from 'react';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

type Tone = 'red' | 'green' | 'purple' | 'blue' | 'indigo';

interface Props {
  label: string;
  value: string;
  delta?: number | null;
  tone?: Tone;
  icon: ReactNode;
  invertDelta?: boolean;
}

export default function Kpi({ label, value, delta, tone = 'blue', icon, invertDelta }: Props) {
  const hasDelta = delta !== null && delta !== undefined && isFinite(delta);
  const positive = hasDelta ? (invertDelta ? (delta as number) < 0 : (delta as number) >= 0) : false;
  const sign = hasDelta ? Math.abs(delta as number).toFixed(1) : '';

  return (
    <div className="kpi">
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-icon ${tone}`}>{icon}</span>
      </div>
      <span className={`kpi-value tone-${tone}`}>{value}</span>
      {hasDelta && (
        <span className={`kpi-delta ${positive ? 'up' : 'down'}`}>
          {positive ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          {sign}%
        </span>
      )}
    </div>
  );
}

export function fmtMoney(n: number): string {
  if (!isFinite(n)) return '$0.00';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number): string {
  if (!isFinite(n)) return '0.00%';
  return `${n.toFixed(2)}%`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = String(d.getUTCDate()).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}

export function fmtDayShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`;
}
