'use client';

import React, { useState, useEffect } from 'react';
import {
  Layout,
  Typography,
  DatePicker,
  Button,
  Row,
  Col,
  Card,
  Select,
  Alert,
  Spin,
  Table,
  Tag,
} from 'antd';
import {
  ReloadOutlined,
  DollarOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(utc);
dayjs.extend(relativeTime);

import DashboardLayout from '../../components/Layout/DashboardLayout';
import CostRevenueMapping from '../../components/Dashboard/CostRevenueMapping';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const INUVO_ACCOUNTS = [
  { id: '9532228491', name: 'kaptinklunk - Inuvo - PST' },
  { id: '9375852176', name: 'kaptinklunk - Inuvo - PST 2' },
  { id: '6641065048', name: 'kaptinklunk - Inuvo - PST 3' },
];

const ALL_ACCOUNTS_OPTION = { id: 'ALL_ACCOUNTS', name: 'All Accounts (Total)' };

interface AccountSummary {
  account_id: string;
  account_name: string;
  total_cost: number;
  total_revenue: number;
  total_profit: number;
  roi: number;
  campaign_count: number;
}

interface InuvoApiResponse {
  inuvo_data: any;
  google_ads_data: any;
  cost_revenue_mapping: any[];
  summary: any;
  account_summaries?: AccountSummary[];
  _source: string;
  _timestamp: string;
  _message: string;
}

export default function InuvoDashboard() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InuvoApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs()]);
  const [selectedAccount, setSelectedAccount] = useState<string>(ALL_ACCOUNTS_OPTION.id);
  const [dataType, setDataType] = useState<'realtime' | 'daily'>('realtime');

  // Auth check — admin gets all-accounts view, users get their own account
  useEffect(() => {
    const getCookie = (name: string): string | null => {
      if (typeof document === 'undefined') return null;
      const val = document.cookie.split('; ').find(r => r.startsWith(name + '='));
      return val ? val.split('=')[1] : null;
    };

    const authType = getCookie('auth_type');
    const userAccountId = getCookie('account_id');

    const admin = authType === 'admin';
    setIsAdmin(admin);

    if (authType === 'user' && userAccountId) {
      const accountValue = userAccountId.replace('CID_', '');
      setSelectedAccount(accountValue);
    } else if (admin) {
      setSelectedAccount(ALL_ACCOUNTS_OPTION.id);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [dateRange, selectedAccount, dataType]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');

      const isAllAccounts = selectedAccount === ALL_ACCOUNTS_OPTION.id;

      const requestBody: any = {
        startDate,
        endDate,
        dataType,
        useMockData: false,
        forceRefresh: false,
        ...(isAllAccounts
          ? { accountIds: INUVO_ACCOUNTS.map(a => a.id) }
          : { customerId: selectedAccount }),
      };

      const response = await fetch('/api/inuvo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText}`);

      const result: InuvoApiResponse = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const accountSummaryColumns = [
    {
      title: 'Account',
      dataIndex: 'account_name',
      key: 'account_name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Campaigns',
      dataIndex: 'campaign_count',
      key: 'campaign_count',
      align: 'center' as const,
    },
    {
      title: 'Total Cost',
      dataIndex: 'total_cost',
      key: 'total_cost',
      render: (v: number) => <Text style={{ color: '#ff4d4f' }}>${v.toFixed(2)}</Text>,
      sorter: (a: AccountSummary, b: AccountSummary) => a.total_cost - b.total_cost,
    },
    {
      title: 'Total Revenue',
      dataIndex: 'total_revenue',
      key: 'total_revenue',
      render: (v: number) => <Text style={{ color: '#52c41a' }}>${v.toFixed(2)}</Text>,
      sorter: (a: AccountSummary, b: AccountSummary) => a.total_revenue - b.total_revenue,
    },
    {
      title: 'Net Profit',
      dataIndex: 'total_profit',
      key: 'total_profit',
      render: (v: number) => (
        <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>
          {v >= 0 ? '+' : ''}${v.toFixed(2)}
        </Text>
      ),
      sorter: (a: AccountSummary, b: AccountSummary) => a.total_profit - b.total_profit,
    },
    {
      title: 'ROI',
      dataIndex: 'roi',
      key: 'roi',
      render: (v: number) => (
        <Tag color={v >= 0 ? 'green' : 'red'}>{v.toFixed(1)}%</Tag>
      ),
      sorter: (a: AccountSummary, b: AccountSummary) => a.roi - b.roi,
    },
  ];

  const accountDropdownOptions = isAdmin
    ? [ALL_ACCOUNTS_OPTION, ...INUVO_ACCOUNTS]
    : INUVO_ACCOUNTS;

  return (
    <DashboardLayout>
      <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
        <Header style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '12px 24px',
          height: 'auto',
          minHeight: '80px'
        }}>
          <Row align="middle" justify="space-between" style={{ height: '100%' }}>
            <Col xs={18} sm={16} md={18} lg={20}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <ApiOutlined style={{ fontSize: '24px', color: 'white', marginRight: '12px' }} />
                <div>
                  <Title level={3} style={{ color: 'white', margin: 0, fontSize: '20px', lineHeight: '1.2' }}>
                    Inuvo Cost/Revenue Analysis
                  </Title>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', display: 'block', marginTop: '2px' }}>
                    Mapping between Google Ads cost and Inuvo revenue
                  </Text>
                </div>
              </div>
            </Col>
            <Col xs={6} sm={8} md={6} lg={4}>
              <div style={{ color: 'white', textAlign: 'right' }}>
                <div style={{ fontSize: '11px', opacity: 0.8 }}>Last Updated</div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>
                  {data?._timestamp ? dayjs(data._timestamp).format('HH:mm:ss') : '--:--:--'}
                </div>
              </div>
            </Col>
          </Row>
        </Header>

        <Content style={{ padding: '24px' }}>
          {/* Controls */}
          <Card style={{ marginBottom: '24px' }}>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} sm={12} md={8} lg={6}>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>Date Range</Text>
                <RangePicker
                  value={dateRange}
                  onChange={(dates) => {
                    if (dates && dates[0] && dates[1]) setDateRange([dates[0], dates[1]]);
                  }}
                  style={{ width: '100%' }}
                  allowClear={false}
                  maxDate={dayjs()}
                />
              </Col>

              {/* Account selector — admin sees all options, users see only their account */}
              {isAdmin && (
                <Col xs={24} sm={12} md={8} lg={5}>
                  <Text strong style={{ display: 'block', marginBottom: '8px' }}>Account</Text>
                  <Select
                    value={selectedAccount}
                    onChange={setSelectedAccount}
                    style={{ width: '100%' }}
                  >
                    {accountDropdownOptions.map(acc => (
                      <Option key={acc.id} value={acc.id}>{acc.name}</Option>
                    ))}
                  </Select>
                </Col>
              )}

              <Col xs={24} sm={12} md={8} lg={4}>
                <Text strong style={{ display: 'block', marginBottom: '8px' }}>Data Type</Text>
                <Select value={dataType} onChange={setDataType} style={{ width: '100%' }}>
                  <Option value="realtime">Realtime</Option>
                  <Option value="daily">Daily</Option>
                </Select>
              </Col>

              <Col xs={24} sm={12} md={8} lg={4}>
                <div style={{ paddingTop: '24px' }}>
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={fetchData}
                    loading={loading}
                    style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      borderColor: 'transparent',
                      width: '100%',
                      height: '40px',
                      fontWeight: 500,
                    }}
                  >
                    Refresh Data
                  </Button>
                </div>
              </Col>
            </Row>
          </Card>

          {/* Alerts */}
          {error && (
            <Alert
              message="Error Loading Data"
              description={error}
              type="error"
              showIcon
              style={{ marginBottom: '24px' }}
              action={<Button size="small" onClick={fetchData}>Retry</Button>}
            />
          )}
          {data?._source === 'mock_fallback' && (
            <Alert message="Using Mock Data" description={data._message} type="warning" showIcon style={{ marginBottom: '24px' }} />
          )}
          {data?._message && data._source !== 'mock_fallback' && (
            <Alert message="Data Status" description={data._message} type="info" showIcon style={{ marginBottom: '24px' }} />
          )}

          <Spin spinning={loading} size="large">
            {data ? (
              <>
                {/* 1. Summary tiles (Total Cost / Revenue / Profit / ROI) */}
                <CostRevenueMapping
                  data={data.cost_revenue_mapping || []}
                  summary={data.summary || {
                    totalCost: 0,
                    totalRevenue: 0,
                    totalProfit: 0,
                    overallROI: 0,
                    profitableCampaigns: 0,
                    totalCampaigns: 0,
                    profitabilityRate: 0
                  }}
                  loading={loading}
                  showDetailedView={true}
                  hideCampaignDetails={true}
                />

                {/* 2. Per-account breakdown (admin all-accounts view only) */}
                {selectedAccount === ALL_ACCOUNTS_OPTION.id && data.account_summaries && data.account_summaries.length > 0 && (
                  <Card
                    title={<Text strong>Account Breakdown</Text>}
                    style={{ marginBottom: '24px' }}
                  >
                    <Table
                      dataSource={data.account_summaries}
                      columns={accountSummaryColumns}
                      rowKey="account_id"
                      pagination={false}
                      size="small"
                    />
                  </Card>
                )}

                {/* 3. Campaign details */}
                <CostRevenueMapping
                  data={data.cost_revenue_mapping || []}
                  summary={data.summary || {
                    totalCost: 0,
                    totalRevenue: 0,
                    totalProfit: 0,
                    overallROI: 0,
                    profitableCampaigns: 0,
                    totalCampaigns: 0,
                    profitabilityRate: 0
                  }}
                  loading={loading}
                  showDetailedView={true}
                  hideSummaryCards={true}
                />
              </>
            ) : (
              <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
                <DollarOutlined style={{ fontSize: '64px', color: '#d9d9d9', marginBottom: '16px' }} />
                <Title level={4} type="secondary">No Data Available</Title>
                <Paragraph type="secondary">
                  Click "Refresh Data" to load cost/revenue mappings
                </Paragraph>
              </Card>
            )}
          </Spin>
        </Content>
      </Layout>
    </DashboardLayout>
  );
}
