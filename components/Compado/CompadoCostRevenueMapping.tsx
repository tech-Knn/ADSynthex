'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Statistic,
  Progress,
  Tag,
  Tooltip,
  Space,
  Switch,
  Alert,
  Typography,
  Badge
} from 'antd';
import {
  DollarOutlined,
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
  InfoCircleOutlined,
  FireOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from 'chart.js';
import type { ColumnsType } from 'antd/es/table';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTitle, ChartTooltip, ChartLegend);

const { Title, Text } = Typography;

interface CompadoCostRevenueMapping {
  gclid: string;
  campaign_id: string;
  campaign_name?: string;
  // Google Ads Metrics
  cost: number;
  clicks: number;
  impressions: number;
  cpc: number;
  ctr: number;
  // Compado Metrics
  conversions: number;
  revenue: number;
  conversion_rate: number;
  revenue_per_click: number;
  // Calculated Metrics
  profit: number;
  roi: number;
  roas: number;
  date: string;
}

interface Summary {
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  totalConversions: number;
  totalClicks: number;
  totalImpressions: number;
  overallROI: number;
  overallROAS: number;
  averageConversionRate: number;
  profitableCampaigns: number;
  totalCampaigns: number;
  profitabilityRate: number;
}

interface Props {
  data: CompadoCostRevenueMapping[];
  summary: Summary;
  loading?: boolean;
  showDetailedView?: boolean;
}

export default function CompadoCostRevenueMapping({
  data,
  summary,
  loading = false,
  showDetailedView = false
}: Props) {
  const [detailedView, setDetailedView] = useState(showDetailedView);
  const [sortedData, setSortedData] = useState<CompadoCostRevenueMapping[]>([]);

  useEffect(() => {
    const sorted = [...data].sort((a, b) => b.profit - a.profit);
    setSortedData(sorted);
  }, [data]);

  const columns: ColumnsType<CompadoCostRevenueMapping> = [
    {
      title: (
        <div style={{ textAlign: 'center', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: 'white', padding: '8px', borderRadius: '8px', fontWeight: 800 }}>
          Campaign
        </div>
      ),
      children: [
        {
          title: 'Campaign',
          dataIndex: 'campaign_name',
          key: 'campaign_name',
          width: 180,
          fixed: 'left',
          render: (name: string, record: CompadoCostRevenueMapping) => (
            <div style={{ padding: '8px 0' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#2c3e50', marginBottom: '4px' }}>
                {name || 'Unknown Campaign'}
              </div>
              <Text style={{ fontSize: '11px', color: '#7f8c8d', background: '#f8f9fa', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                GCLID: {record.gclid.substring(0, 12)}...
              </Text>
            </div>
          ),
        }
      ]
    },
    {
      title: (
        <div style={{ textAlign: 'center', background: 'linear-gradient(135deg, #4285F4 0%, #DB4437 25%, #F4B400 50%, #0F9D58 75%, #4285F4 100%)', color: 'white', padding: '8px', borderRadius: '8px', fontWeight: 800 }}>
          Google Ads Metrics
        </div>
      ),
      children: [
        {
          title: 'Cost',
          dataIndex: 'cost',
          key: 'cost',
          width: 80,
          render: (cost: number) => (
            <Text style={{ color: cost > 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: 600 }}>
              ${cost.toFixed(2)}
            </Text>
          ),
          sorter: (a, b) => a.cost - b.cost,
        },
        {
          title: 'Clicks',
          dataIndex: 'clicks',
          key: 'clicks',
          width: 70,
          render: (clicks: number) => (
            <Text style={{ fontWeight: 600, color: clicks > 0 ? '#1890ff' : '#8c8c8c' }}>
              {clicks}
            </Text>
          ),
          sorter: (a, b) => a.clicks - b.clicks,
        },
        {
          title: 'CPC',
          dataIndex: 'cpc',
          key: 'cpc',
          width: 70,
          render: (cpc: number) => (
            <Text style={{ color: '#722ed1', fontWeight: 600 }}>
              ${cpc.toFixed(2)}
            </Text>
          ),
          sorter: (a, b) => a.cpc - b.cpc,
        },
        {
          title: 'CTR',
          dataIndex: 'ctr',
          key: 'ctr',
          width: 70,
          render: (ctr: number) => (
            <Text style={{ color: '#1890ff', fontWeight: 600 }}>
              {ctr.toFixed(2)}%
            </Text>
          ),
          sorter: (a, b) => a.ctr - b.ctr,
        },
      ]
    },
    {
      title: (
        <div style={{ textAlign: 'center', background: 'linear-gradient(135deg, #00d4aa, #00b894, #00a085)', color: 'white', padding: '8px', borderRadius: '8px', fontWeight: 800 }}>
          Compado Metrics
        </div>
      ),
      children: [
        {
          title: 'Conversions',
          dataIndex: 'conversions',
          key: 'conversions',
          width: 90,
          render: (conversions: number) => (
            <Tag color={conversions > 0 ? 'green' : 'default'} style={{ fontSize: '13px', fontWeight: 500 }}>
              {conversions}
            </Tag>
          ),
          sorter: (a, b) => a.conversions - b.conversions,
        },
        {
          title: 'Revenue',
          dataIndex: 'revenue',
          key: 'revenue',
          width: 90,
          render: (revenue: number) => (
            <Text style={{ color: revenue > 0 ? '#52c41a' : '#8c8c8c', fontWeight: 600 }}>
              ${revenue.toFixed(2)}
            </Text>
          ),
          sorter: (a, b) => a.revenue - b.revenue,
        },
        {
          title: 'Conv. Rate',
          dataIndex: 'conversion_rate',
          key: 'conversion_rate',
          width: 80,
          render: (rate: number) => (
            <Text style={{ color: rate > 0 ? '#722ed1' : '#8c8c8c', fontWeight: 600 }}>
              {rate.toFixed(2)}%
            </Text>
          ),
          sorter: (a, b) => a.conversion_rate - b.conversion_rate,
        },
        {
          title: 'Rev/Click',
          dataIndex: 'revenue_per_click',
          key: 'revenue_per_click',
          width: 80,
          render: (rpc: number) => (
            <Text style={{ color: '#fa8c16', fontWeight: 600 }}>
              ${rpc.toFixed(3)}
            </Text>
          ),
          sorter: (a, b) => a.revenue_per_click - b.revenue_per_click,
        },
      ]
    },
    {
      title: (
        <div style={{ textAlign: 'center', background: 'linear-gradient(135deg, #f093fb, #f5576c)', color: 'white', padding: '8px', borderRadius: '8px', fontWeight: 800 }}>
          Performance
        </div>
      ),
      children: [
        {
          title: 'Profit',
          dataIndex: 'profit',
          key: 'profit',
          width: 90,
          render: (profit: number) => (
            <Text style={{ color: profit > 0 ? '#52c41a' : profit < 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: 600 }}>
              {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
            </Text>
          ),
          sorter: (a, b) => a.profit - b.profit,
          defaultSortOrder: 'descend',
        },
        {
          title: 'ROI',
          dataIndex: 'roi',
          key: 'roi',
          width: 80,
          render: (roi: number) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Text style={{ color: roi > 0 ? '#52c41a' : roi < 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: 600 }}>
                {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
              </Text>
              {roi >= 100 && <FireOutlined style={{ color: '#ff7a00', fontSize: '12px' }} />}
              {roi < -50 && <WarningOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />}
            </div>
          ),
          sorter: (a, b) => a.roi - b.roi,
        },
        {
          title: 'ROAS',
          dataIndex: 'roas',
          key: 'roas',
          width: 70,
          render: (roas: number) => (
            <Text style={{ color: roas > 1 ? '#52c41a' : roas < 1 ? '#ff4d4f' : '#8c8c8c', fontWeight: 600 }}>
              {roas.toFixed(2)}x
            </Text>
          ),
          sorter: (a, b) => a.roas - b.roas,
        },
      ]
    }
  ];

  const chartData = {
    labels: sortedData.slice(0, 10).map(item =>
      (item.campaign_name?.substring(0, 20) || 'Unknown') + (item.campaign_name && item.campaign_name.length > 20 ? '...' : '')
    ),
    datasets: [
      {
        label: 'Cost',
        data: sortedData.slice(0, 10).map(item => item.cost),
        backgroundColor: 'rgba(255, 77, 79, 0.6)',
        borderColor: 'rgba(255, 77, 79, 1)',
        borderWidth: 2,
      },
      {
        label: 'Revenue',
        data: sortedData.slice(0, 10).map(item => item.revenue),
        backgroundColor: 'rgba(82, 196, 26, 0.6)',
        borderColor: 'rgba(82, 196, 26, 1)',
        borderWidth: 2,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Top 10 Campaigns: Cost vs Revenue' }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: function(value: any) { return '$' + value.toFixed(2); } }
      }
    }
  };

  return (
    <div>
      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Cost"
              value={summary.totalCost}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#ff4d4f' }}
              suffix={<Tooltip title="Total Google Ads spend"><InfoCircleOutlined style={{ fontSize: '14px', color: '#999' }} /></Tooltip>}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Revenue"
              value={summary.totalRevenue}
              precision={2}
              prefix="$"
              valueStyle={{ color: '#52c41a' }}
              suffix={<Tooltip title="Total Compado conversion revenue"><InfoCircleOutlined style={{ fontSize: '14px', color: '#999' }} /></Tooltip>}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Net Profit"
              value={summary.totalProfit}
              precision={2}
              prefix={summary.totalProfit >= 0 ? '+$' : '-$'}
              valueStyle={{ color: summary.totalProfit >= 0 ? '#52c41a' : '#ff4d4f' }}
              suffix={summary.totalProfit >= 0 ? <RiseOutlined style={{ color: '#52c41a' }} /> : <FallOutlined style={{ color: '#ff4d4f' }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Overall ROI"
              value={summary.overallROI}
              precision={1}
              suffix="%"
              prefix={summary.overallROI >= 0 ? '+' : ''}
              valueStyle={{ color: summary.overallROI >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
            <div style={{ marginTop: '8px' }}>
              <Progress
                percent={Math.min(Math.abs(summary.overallROI), 200)}
                strokeColor={summary.overallROI >= 0 ? '#52c41a' : '#ff4d4f'}
                showInfo={false}
                size="small"
              />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Additional Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Conversions"
              value={summary.totalConversions}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="ROAS"
              value={summary.overallROAS}
              precision={2}
              suffix="x"
              valueStyle={{ color: summary.overallROAS >= 1 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Conversion Rate"
              value={summary.averageConversionRate}
              precision={2}
              suffix="%"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Clicks"
              value={summary.totalClicks}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Profitability Overview */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col span={24}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <Title level={4} style={{ margin: 0 }}>
                <TrophyOutlined style={{ color: '#faad14', marginRight: '8px' }} />
                Campaign Profitability Overview
              </Title>
              <Space>
                <Switch
                  checkedChildren="Detailed"
                  unCheckedChildren="Summary"
                  checked={detailedView}
                  onChange={setDetailedView}
                />
              </Space>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
              <Col xs={24} sm={8}>
                <div style={{ textAlign: 'center' }}>
                  <Badge count={summary.profitableCampaigns} style={{ backgroundColor: '#52c41a' }}>
                    <div style={{ padding: '12px', background: '#f6ffed', borderRadius: '8px', minWidth: '60px' }}>
                      <Text strong style={{ color: '#52c41a' }}>Profitable</Text>
                    </div>
                  </Badge>
                </div>
              </Col>

              <Col xs={24} sm={8}>
                <div style={{ textAlign: 'center' }}>
                  <Badge count={summary.totalCampaigns - summary.profitableCampaigns} style={{ backgroundColor: '#ff4d4f' }}>
                    <div style={{ padding: '12px', background: '#fff2f0', borderRadius: '8px', minWidth: '60px' }}>
                      <Text strong style={{ color: '#ff4d4f' }}>Loss-Making</Text>
                    </div>
                  </Badge>
                </div>
              </Col>

              <Col xs={24} sm={8}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ padding: '12px', background: '#f0f2f5', borderRadius: '8px' }}>
                    <Text strong>{summary.profitabilityRate}%</Text>
                    <br />
                    <Text type="secondary">Success Rate</Text>
                  </div>
                </div>
              </Col>
            </Row>

            {summary.totalCampaigns === 0 && (
              <Alert
                message="No data available"
                description="No cost/revenue mappings found. Check GCLID matching between Google Ads and Compado conversions."
                type="info"
                showIcon
                style={{ marginTop: '16px' }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Chart */}
      {data.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col span={24}>
            <Card title="Cost vs Revenue Comparison">
              <Bar data={chartData} options={chartOptions} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Detailed Table */}
      {detailedView && data.length > 0 && (
        <Card title={`Campaign Details (${data.length} campaigns)`}>
          <Table
            columns={columns}
            dataSource={sortedData}
            rowKey="gclid"
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} campaigns`
            }}
            scroll={{ x: 1400 }}
            size="small"
          />
        </Card>
      )}
    </div>
  );
}
