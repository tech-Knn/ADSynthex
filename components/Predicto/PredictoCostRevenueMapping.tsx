'use client';

import React, { useState, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Tag,
  Tooltip,
  Typography,
  Input,
  Select,
} from 'antd';
import {
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { Option } = Select;

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
  summary?: Summary;
  loading?: boolean;
}

export default function PredictoCostRevenueMapping({
  data,
  summary,
  loading = false,
}: Props) {
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'cost' | 'impressions' | 'clicks' | 'ctr' | 'roi' | 'profit'>('revenue');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const filteredAndSortedData = useMemo(() => {
    let filtered = [...data];

    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(item => {
        const campaignName = item.campaign_name?.toLowerCase() || '';
        const campaignId = String(item.campaign_id).toLowerCase();
        return campaignName.includes(searchLower) || campaignId.includes(searchLower);
      });
    }

    filtered.sort((a, b) => {
      let compareValue = 0;

      switch (sortBy) {
        case 'revenue':
          compareValue = a.revenue - b.revenue;
          break;
        case 'cost':
          compareValue = a.cost - b.cost;
          break;
        case 'impressions':
          compareValue = a.impressions - b.impressions;
          break;
        case 'clicks':
          compareValue = a.clicks - b.clicks;
          break;
        case 'ctr':
          compareValue = a.ctr - b.ctr;
          break;
        case 'roi':
          compareValue = a.roi - b.roi;
          break;
        case 'profit':
          compareValue = a.profit - b.profit;
          break;
        default:
          compareValue = a.revenue - b.revenue;
      }

      return sortOrder === 'desc' ? -compareValue : compareValue;
    });

    return filtered;
  }, [data, searchText, sortBy, sortOrder]);

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
      {/* Data Table */}
      <Card>
        <div style={{ marginBottom: '24px' }}>
          <Title level={4} style={{ margin: 0, marginBottom: '4px' }}>Campaign Performance Details</Title>
          <Text type="secondary" style={{ fontSize: '13px' }}>
            {filteredAndSortedData.length} campaign{filteredAndSortedData.length !== 1 ? 's' : ''}
            {searchText ? ' (filtered)' : ''}
          </Text>
        </div>

        <Row gutter={16} style={{ marginBottom: '20px' }}>
          <Col xs={24} sm={24} md={8}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong style={{ fontSize: '13px', color: '#333333' }}>Search Campaign</Text>
            </div>
            <Input
              placeholder="Search by Campaign Name"
              prefix={<SearchOutlined style={{ color: '#666666' }} />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
              style={{
                width: '100%',
                height: '42px',
                background: '#f8f9fa',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#333333',
                transition: 'all 0.3s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#1890ff';
                e.target.style.background = '#ffffff';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e0e0e0';
                e.target.style.background = '#f8f9fa';
              }}
            />
          </Col>

          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong style={{ fontSize: '13px', color: '#333333' }}>Sort By</Text>
            </div>
            <Select
              value={sortBy}
              onChange={setSortBy}
              style={{
                width: '100%',
                height: '42px',
              }}
              className="predicto-select"
            >
              <Option value="revenue">Revenue</Option>
              <Option value="cost">Cost</Option>
              <Option value="profit">Profit</Option>
              <Option value="roi">ROI</Option>
              <Option value="impressions">Impressions</Option>
              <Option value="clicks">Clicks</Option>
              <Option value="ctr">CTR</Option>
            </Select>
          </Col>

          <Col xs={24} sm={12} md={8}>
            <div style={{ marginBottom: '8px' }}>
              <Text strong style={{ fontSize: '13px', color: '#333333' }}>Sort Order</Text>
            </div>
            <Select
              value={sortOrder}
              onChange={setSortOrder}
              style={{
                width: '100%',
                height: '42px',
              }}
              className="predicto-select"
            >
              <Option value="desc">Highest First</Option>
              <Option value="asc">Lowest First</Option>
            </Select>
          </Col>
        </Row>

        <style jsx>{`
          :global(.predicto-select .ant-select-selector) {
            height: 42px !important;
            background: #f8f9fa !important;
            border: 1px solid #e0e0e0 !important;
            border-radius: 6px !important;
            padding: 8px 11px !important;
            font-size: 14px !important;
            color: #333333 !important;
            transition: all 0.3s ease !important;
          }

          :global(.predicto-select .ant-select-selector:hover) {
            border-color: #1890ff !important;
            background: #ffffff !important;
          }

          :global(.predicto-select.ant-select-focused .ant-select-selector) {
            border-color: #1890ff !important;
            background: #ffffff !important;
            box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1) !important;
          }

          :global(.predicto-select .ant-select-selection-item) {
            line-height: 26px !important;
          }

          :global(.predicto-select .ant-select-arrow) {
            color: #666666 !important;
          }
        `}</style>
        <Table
          columns={columns}
          dataSource={filteredAndSortedData}
          rowKey="campaign_id"
          loading={loading}
          pagination={{
            pageSize: 50,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} campaigns`,
          }}
          scroll={{ x: 1400 }}
          size="middle"
        />
      </Card>
    </div>
  );
}
