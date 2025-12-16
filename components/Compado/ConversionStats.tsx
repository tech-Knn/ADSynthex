'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Spin, message, DatePicker, Button } from 'antd';
import {
  DollarOutlined,
  ThunderboltOutlined,
  FundOutlined,
  RiseOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

interface ConversionStatsData {
  total_conversions: number;
  total_revenue: number;
  average_revenue_per_conversion: number;
  unique_campaigns: number;
  date_range: {
    start_date: string;
    end_date: string;
  };
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, loading }) => {
  return (
    <Card
      style={{
        borderRadius: '8px',
        overflow: 'hidden',
        height: '100%',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.05)'
      }}
      bodyStyle={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <div style={{ marginBottom: '8px', color: '#8c8c8c', fontSize: '14px' }}>
        {title}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        {loading ? (
          <Spin />
        ) : (
          <>
            <div
              style={{
                fontSize: '24px',
                fontWeight: 600,
                color: color
              }}
            >
              {value}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: `${color}20`,
                color: color,
                fontSize: '18px'
              }}
            >
              {icon}
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

const ConversionStats: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<ConversionStatsData | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(7, 'days'),
    dayjs()
  ]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');

      const response = await fetch('/api/compado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          action: 'stats'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch conversion stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (error: any) {
      console.error('Error fetching conversion stats:', error);
      message.error(error.message || 'Failed to load conversion data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleDateRangeChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]]);
    }
  };

  const handleRefresh = () => {
    fetchStats();
  };

  const formatCurrency = (value: number): string => {
    return `$${value.toFixed(2)}`;
  };

  const formatNumber = (value: number): string => {
    return value.toLocaleString();
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Conversion Tracking</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <RangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            format="YYYY-MM-DD"
            allowClear={false}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total Conversions"
            value={stats ? formatNumber(stats.total_conversions) : '0'}
            icon={<ThunderboltOutlined />}
            color="#52c41a"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total Revenue"
            value={stats ? formatCurrency(stats.total_revenue) : '$0.00'}
            icon={<DollarOutlined />}
            color="#1890ff"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Average Revenue"
            value={stats ? formatCurrency(stats.average_revenue_per_conversion) : '$0.00'}
            icon={<FundOutlined />}
            color="#722ed1"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Active Campaigns"
            value={stats ? formatNumber(stats.unique_campaigns) : '0'}
            icon={<RiseOutlined />}
            color="#fa8c16"
            loading={loading}
          />
        </Col>
      </Row>

      {stats && !loading && (
        <Card
          style={{ marginTop: '16px', borderRadius: '8px' }}
          bodyStyle={{ padding: '20px' }}
        >
          <div style={{ color: '#8c8c8c', fontSize: '12px' }}>
            Showing data from {stats.date_range.start_date} to {stats.date_range.end_date}
          </div>
        </Card>
      )}
    </div>
  );
};

export default ConversionStats;
