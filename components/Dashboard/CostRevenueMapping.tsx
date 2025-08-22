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
  Button, 
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
  ReloadOutlined,
  InfoCircleOutlined,
  FireOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from 'chart.js';
import type { ColumnsType } from 'antd/es/table';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ChartTitle,
  ChartTooltip,
  ChartLegend
);

const { Title, Text } = Typography;

interface CostRevenueMapping {
  TKID: string;
  cost: number;
  revenue: number;
  profit: number;
  roi: number;
  platform: string;
  campaign_name?: string;
  date: string;
}

interface CostRevenueSummary {
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  overallROI: number;
  profitableCampaigns: number;
  totalCampaigns: number;
  profitabilityRate: number;
}

interface CostRevenueMappingProps {
  data: CostRevenueMapping[];
  summary: CostRevenueSummary;
  loading?: boolean;
  onRefresh?: () => void;
  showDetailedView?: boolean;
}

export default function CostRevenueMapping({ 
  data, 
  summary, 
  loading = false, 
  onRefresh,
  showDetailedView = false 
}: CostRevenueMappingProps) {
  const [detailedView, setDetailedView] = useState(showDetailedView);
  const [sortedData, setSortedData] = useState<CostRevenueMapping[]>([]);

  useEffect(() => {
    // Sort data by profit (highest first)
    const sorted = [...data].sort((a, b) => b.profit - a.profit);
    setSortedData(sorted);
  }, [data]);

  // Table columns for detailed view
  const columns: ColumnsType<CostRevenueMapping> = [
    {
      title: 'Campaign',
      dataIndex: 'campaign_name',
      key: 'campaign_name',
      width: 200,
      render: (name: string, record: CostRevenueMapping) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name || 'Unknown Campaign'}</div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            TKID: {record.TKID}
          </Text>
        </div>
      ),
    },
    {
      title: 'Platform',
      dataIndex: 'platform',
      key: 'platform',
      width: 100,
      render: (platform: string) => (
        <Tag color={platform === 'Desktop' ? 'blue' : platform === 'HighEndMobile' ? 'green' : 'orange'}>
          {platform}
        </Tag>
      ),
    },
    {
      title: 'Cost',
      dataIndex: 'cost',
      key: 'cost',
      width: 100,
      render: (cost: number) => (
        <Text style={{ color: '#ff4d4f', fontWeight: 500 }}>
          ${cost.toFixed(2)}
        </Text>
      ),
      sorter: (a, b) => a.cost - b.cost,
    },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      width: 100,
      render: (revenue: number) => (
        <Text style={{ color: '#52c41a', fontWeight: 500 }}>
          ${revenue.toFixed(2)}
        </Text>
      ),
      sorter: (a, b) => a.revenue - b.revenue,
    },
    {
      title: 'Profit',
      dataIndex: 'profit',
      key: 'profit',
      width: 100,
      render: (profit: number) => (
        <Text style={{ 
          color: profit >= 0 ? '#52c41a' : '#ff4d4f', 
          fontWeight: 500 
        }}>
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
      width: 120,
      render: (roi: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Text style={{ 
            color: roi >= 0 ? '#52c41a' : '#ff4d4f',
            fontWeight: 500 
          }}>
            {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
          </Text>
          {roi >= 100 && <FireOutlined style={{ color: '#ff7a00' }} />}
          {roi < -50 && <WarningOutlined style={{ color: '#ff4d4f' }} />}
        </div>
      ),
      sorter: (a, b) => a.roi - b.roi,
    }
  ];

  // Chart data for cost vs revenue
  const chartData = {
    labels: sortedData.slice(0, 10).map(item => 
      item.campaign_name?.substring(0, 20) + (item.campaign_name && item.campaign_name.length > 20 ? '...' : '') || 'Unknown'
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
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Top 10 Campaigns: Cost vs Revenue'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return '$' + value.toFixed(2);
          }
        }
      }
    }
  };

  // ROI trend chart
  const roiChartData = {
    labels: sortedData.slice(0, 10).map(item => 
      item.campaign_name?.substring(0, 15) + '...' || 'Unknown'
    ),
    datasets: [
      {
        label: 'ROI %',
        data: sortedData.slice(0, 10).map(item => item.roi),
        fill: false,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: sortedData.slice(0, 10).map(item => 
          item.roi >= 0 ? 'rgba(82, 196, 26, 0.8)' : 'rgba(255, 77, 79, 0.8)'
        ),
        tension: 0.1
      }
    ]
  };

  const roiChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'ROI Performance by Campaign'
      }
    },
    scales: {
      y: {
        ticks: {
          callback: function(value: any) {
            return value + '%';
          }
        }
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
              suffix={
                <Tooltip title="Total advertising spend">
                  <InfoCircleOutlined style={{ fontSize: '14px', color: '#999' }} />
                </Tooltip>
              }
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
              suffix={
                <Tooltip title="Total revenue from Inuvo">
                  <InfoCircleOutlined style={{ fontSize: '14px', color: '#999' }} />
                </Tooltip>
              }
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
              suffix={
                summary.totalProfit >= 0 ? 
                  <RiseOutlined style={{ color: '#52c41a' }} /> : 
                  <FallOutlined style={{ color: '#ff4d4f' }} />
              }
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
                description="No cost/revenue mappings found. Check TKID mapping between Google Ads and Inuvo data."
                type="info"
                showIcon
                style={{ marginTop: '16px' }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      {data.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col xs={24} lg={12}>
            <Card title="Cost vs Revenue Comparison">
              <Bar data={chartData} options={chartOptions} />
            </Card>
          </Col>
          
          <Col xs={24} lg={12}>
            <Card title="ROI Performance">
              <Bar data={roiChartData} options={roiChartOptions} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Detailed Table */}
      {detailedView && data.length > 0 && (
        <Card 
          title={`Campaign Details (${data.length} campaigns)`}
          extra={
            <Text type="secondary">
              Sorted by profit (highest first)
            </Text>
          }
        >
          <Table
            columns={columns}
            dataSource={sortedData}
            rowKey="TKID"
            loading={loading}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} campaigns`
            }}
            scroll={{ x: 800 }}
            size="small"
          />
        </Card>
      )}
    </div>
  );
}

