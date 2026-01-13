'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Statistic,
  Tag,
  Tooltip,
  Space,
  Typography,
} from 'antd';
import {
  DollarOutlined,
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;

interface PredictoCostRevenueMapping {
  campaign_id: string;
  campaign_name?: string;
  // Google Ads metrics (cost data)
  cost: number;
  clicks: number;
  impressions: number;
  conversions?: number;
  // Predicto metrics (revenue data)
  revenue: number;
  predicto_clicks?: number;
  predicto_impressions?: number;
  // Calculated metrics
  profit: number;
  roi: number;
  roas: number;
  rpc: number;
  cpa?: number;
  ctr: number;
  // Data quality indicators
  has_cost_data: boolean;
  has_revenue_data: boolean;
}

interface Summary {
  total_campaigns: number;
  campaigns_with_cost: number;
  campaigns_with_revenue: number;
  campaigns_matched: number;
  total_cost: number;
  total_revenue: number;
  total_profit: number;
  average_roi: number;
  average_roas: number;
  total_clicks: number;
  total_impressions: number;
  total_conversions: number;
  profitable_campaigns: number;
  unprofitable_campaigns: number;
  match_rate: number;
}

interface Props {
  data: PredictoCostRevenueMapping[];
  summary: Summary;
  loading?: boolean;
}

export default function PredictoCostRevenueMapping({
  data,
  summary,
  loading = false,
}: Props) {
  const [sortedData, setSortedData] = useState<PredictoCostRevenueMapping[]>([]);

  useEffect(() => {
    const sorted = [...data].sort((a, b) => b.profit - a.profit);
    setSortedData(sorted);
  }, [data]);

  const columns: ColumnsType<PredictoCostRevenueMapping> = [
    {
      title: 'Campaign',
      dataIndex: 'campaign_name',
      key: 'campaign_name',
      width: 250,
      fixed: 'left',
      render: (name: string, record: PredictoCostRevenueMapping) => (
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontWeight: 600, fontSize: '14px', color: '#2c3e50', marginBottom: '4px' }}>
            {name || 'Unknown Campaign'}
          </div>
          <Text
            style={{
              fontSize: '11px',
              color: '#7f8c8d',
              background: '#f8f9fa',
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
          >
            ID: {record.campaign_id}
          </Text>
        </div>
      ),
    },
    {
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      width: 110,
      render: (cost: number) => (
        <Text style={{ color: cost > 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: 600, fontSize: '14px' }}>
          ${cost.toFixed(2)}
        </Text>
      ),
      sorter: (a, b) => a.cost - b.cost,
    },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      width: 120,
      render: (revenue: number) => (
        <Text style={{ color: revenue > 0 ? '#52c41a' : '#8c8c8c', fontWeight: 600, fontSize: '14px' }}>
          ${revenue.toFixed(2)}
        </Text>
      ),
      sorter: (a, b) => a.revenue - b.revenue,
    },
    {
      title: 'Profit',
      dataIndex: 'profit',
      key: 'profit',
      width: 120,
      render: (profit: number) => (
        <Text
          style={{
            color: profit > 0 ? '#52c41a' : profit < 0 ? '#ff4d4f' : '#8c8c8c',
            fontWeight: 700,
            fontSize: '14px',
          }}
        >
          {profit > 0 ? '+' : ''}${profit.toFixed(2)}
        </Text>
      ),
      sorter: (a, b) => a.profit - b.profit,
    },
    {
      title: 'ROI',
      dataIndex: 'roi',
      key: 'roi',
      width: 100,
      render: (roi: number) => (
        <Tag color={roi > 0 ? 'green' : roi < 0 ? 'red' : 'default'} style={{ fontSize: '13px' }}>
          {roi > 0 ? '+' : ''}
          {roi.toFixed(1)}%
        </Tag>
      ),
      sorter: (a, b) => a.roi - b.roi,
    },
    {
      title: 'ROAS',
      dataIndex: 'roas',
      key: 'roas',
      width: 100,
      render: (roas: number) => (
        <Tooltip title="Return on Ad Spend">
          <Tag color={roas > 1 ? 'green' : roas > 0.5 ? 'orange' : 'red'} style={{ fontSize: '13px' }}>
            {roas.toFixed(2)}x
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: 'Clicks',
      dataIndex: 'predicto_clicks',
      key: 'predicto_clicks',
      width: 90,
      render: (clicks: number) => (
        <Text style={{ fontWeight: 600, color: clicks > 0 ? '#1890ff' : '#8c8c8c' }}>
          {clicks ? clicks.toLocaleString() : '0'}
        </Text>
      ),
    },
    {
      title: 'Conversions',
      dataIndex: 'conversions',
      key: 'conversions',
      width: 100,
      render: (conversions: number | undefined) => (
        <Text style={{ fontWeight: 600, color: conversions && conversions > 0 ? '#52c41a' : '#8c8c8c' }}>
          {conversions ? conversions.toLocaleString() : '0'}
        </Text>
      ),
    },
    {
      title: 'RPC',
      dataIndex: 'rpc',
      key: 'rpc',
      width: 90,
      render: (rpc: number) => (
        <Tooltip title="Revenue Per Click">
          <Text style={{ color: '#722ed1', fontWeight: 600 }}>${rpc.toFixed(3)}</Text>
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Cost"
              value={summary.total_cost}
              precision={2}
              prefix={<DollarOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f', fontSize: '24px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Total Revenue"
              value={summary.total_revenue}
              precision={2}
              prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a', fontSize: '24px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Profit"
              value={summary.total_profit}
              precision={2}
              prefix={
                summary.total_profit > 0 ? (
                  <RiseOutlined style={{ color: '#52c41a' }} />
                ) : (
                  <FallOutlined style={{ color: '#ff4d4f' }} />
                )
              }
              valueStyle={{
                color: summary.total_profit > 0 ? '#52c41a' : '#ff4d4f',
                fontSize: '24px',
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="ROI"
              value={summary.average_roi}
              precision={1}
              suffix="%"
              prefix={<TrophyOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{
                color: summary.average_roi > 0 ? '#52c41a' : '#ff4d4f',
                fontSize: '24px',
              }}
            />
          </Card>
        </Col>
      </Row>

      {/* Additional Summary Info */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24}>
          <Card>
            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Total Campaigns"
                  value={summary.total_campaigns}
                  valueStyle={{ fontSize: '20px' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Matched Campaigns"
                  value={summary.campaigns_matched}
                  valueStyle={{ fontSize: '20px', color: '#1890ff' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Profitable"
                  value={summary.profitable_campaigns}
                  valueStyle={{ fontSize: '20px', color: '#52c41a' }}
                />
              </Col>
              <Col xs={12} sm={6}>
                <Statistic
                  title="Unprofitable"
                  value={summary.unprofitable_campaigns}
                  valueStyle={{ fontSize: '20px', color: '#ff4d4f' }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* Data Table */}
      <Card title={<Title level={4}>Campaign Performance Details</Title>}>
        <Table
          columns={columns}
          dataSource={sortedData}
          rowKey="campaign_id"
          loading={loading}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal: (total) => `Total ${total} campaigns`,
          }}
          scroll={{ x: 1400 }}
          size="middle"
        />
      </Card>
    </div>
  );
}
