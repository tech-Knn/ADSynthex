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
  Alert,
  Spin,
  Select,
  Space,
  Table,
  Statistic,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import DashboardLayout from '@/components/Layout/DashboardLayout';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

interface AccountSummary {
  customer_id: string;
  account_name: string;
  total_campaigns: number;
  campaigns_matched: number;
  total_cost: number;
  total_revenue: number;
  total_profit: number;
  roi: number;
  roas: number;
}

interface PredictoCostRevenueResponse {
  google_ads_data: any;
  predicto_data: any;
  cost_revenue_mapping: any[];
  campaign_aggregated: any[];
  account_summaries?: AccountSummary[];
  summary: any;
  _source: string;
  _timestamp: string;
  _message: string;
}

interface Account {
  id: string;
  name: string;
}

const PREDICTO_ENABLED_ACCOUNTS: Account[] = [
  { id: '2382992113', name: 'Predicto - EST - 01' },
  { id: '1640518611', name: 'Predicto - EST - 02' },
  { id: '8091270364', name: 'Predicto - EST - 03' },
  { id: '8846129452', name: 'Predicto - EST - 04' },
  { id: '6474140466', name: 'Predicto - EST - 05' },
  { id: '4920639194', name: 'Predicto - EST - 06' },
  { id: '7282297343', name: 'Predicto - EST - 07' },
  { id: '1298005744', name: 'Predicto - EST - 08' },
];

const ALL_ACCOUNTS_OPTION = { id: 'ALL_ACCOUNTS', name: 'All Accounts (Total)' };

export default function PredictoPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PredictoCostRevenueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Default to today's date
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs(),
    dayjs()
  ]);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      fetchData();
    }
  }, [selectedAccount, dateRange]);

  const fetchAccounts = async () => {
    try {
      setLoadingAccounts(true);

      // Check if user is logged in as regular user
      const getCookie = (name: string): string | null => {
        if (typeof document === 'undefined') return null;
        const cookieValue = document.cookie
          .split('; ')
          .find(row => row.startsWith(name + '='));
        return cookieValue ? cookieValue.split('=')[1] : null;
      };

      const authType = getCookie('auth_type');
      const userAccountId = getCookie('account_id');

      // Set admin flag
      setIsAdmin(authType === 'admin');

      // For regular users, only show their account (without CID_ prefix for API calls)
      if (authType === 'user' && userAccountId) {
        const accountValue = userAccountId.replace('CID_', '');

        // Find matching account in PREDICTO_ENABLED_ACCOUNTS
        const matchingAccount = PREDICTO_ENABLED_ACCOUNTS.find(acc => acc.id === accountValue);

        if (matchingAccount) {
          console.log(`[PREDICTO] User account found: ${matchingAccount.name} (${accountValue})`);
          // Only show user's own account in dropdown
          setAccounts([matchingAccount]);
          setSelectedAccount(accountValue);
        } else {
          console.warn(`[PREDICTO] User account ${userAccountId} not found in PREDICTO_ENABLED_ACCOUNTS`);
          setError(`Your account (${userAccountId}) does not have access to Predicto`);
          setAccounts([]);
        }
      } else if (authType === 'admin') {
        // Admin: Show "All Accounts" option + all individual accounts
        const accountsWithAll = [ALL_ACCOUNTS_OPTION, ...PREDICTO_ENABLED_ACCOUNTS];
        console.log('[PREDICTO] Admin logged in, showing all accounts');
        setAccounts(accountsWithAll);
        setSelectedAccount(ALL_ACCOUNTS_OPTION.id);
      } else {
        console.warn('[PREDICTO] No auth_type cookie found');
        setAccounts([]);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      setError('Failed to load accounts');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchData = async (forceRefresh = false) => {
    if (!selectedAccount) {
      console.warn('[PREDICTO] No account selected, skipping fetch');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');

      const requestBody: any = {
        startDate,
        endDate,
        forceRefresh,
        ...(selectedAccount === ALL_ACCOUNTS_OPTION.id
          ? { accountIds: PREDICTO_ENABLED_ACCOUNTS.map((acc) => acc.id) }
          : { customerId: selectedAccount }),
      };

      console.log('[PREDICTO] Fetching data with params:', requestBody);

      // Use cost-revenue mapping endpoint with channel ID mapping
      const response = await fetch('/api/predicto-cost-revenue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[PREDICTO] API response status:', response.status);

      const result = await response.json();
      console.log('[PREDICTO] API response data:', result);

      if (response.ok) {
        console.log('[PREDICTO] Data fetched successfully');
        console.log('[PREDICTO] Campaigns:', result.campaign_aggregated?.length || 0);
        console.log('[PREDICTO] Total Cost:', result.summary?.total_cost || 0);
        console.log('[PREDICTO] Total Revenue:', result.summary?.total_revenue || 0);
        console.log('[PREDICTO] Total Profit:', result.summary?.total_profit || 0);
        setData(result);
      } else {
        const errorMsg = result.error || result.message || 'Failed to fetch data';
        console.error('[PREDICTO] API error:', errorMsg);
        setError(errorMsg);
      }
    } catch (error: any) {
      console.error('[PREDICTO] Exception during fetch:', error);
      setError(error.message || 'Failed to fetch Predicto cost-revenue data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchData(false);
  };

  const handleForceRefresh = () => {
    fetchData(true);
  };

  const handleDateChange = (dates: any) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]]);
    }
  };

  const handleAccountChange = (value: string) => {
    setSelectedAccount(value);
  };

  return (
    <DashboardLayout>
      <Layout style={{ padding: '24px', background: '#f0f2f5' }}>
        <Header
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '8px',
            marginBottom: '24px',
            padding: '0 24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Title level={2} style={{ color: 'white', margin: '16px 0' }}>
              Predicto Dashboard
            </Title>
            <Space>
              <Text style={{ color: 'white', fontSize: '14px' }}>Channel-Based Cost & Revenue Tracking</Text>
            </Space>
          </div>
        </Header>

        <Content>
          <Card style={{ marginBottom: 24 }}>
            <Row gutter={16} align="middle">
              <Col xs={24} sm={12} md={8} lg={6}>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Account:</Text>
                  <Select
                    value={selectedAccount}
                    onChange={handleAccountChange}
                    style={{ width: '100%', marginTop: 8 }}
                    loading={loadingAccounts}
                    disabled={loadingAccounts || accounts.length === 0}
                  >
                    {isAdmin && accounts.length > 1 && (
                      <Option key={ALL_ACCOUNTS_OPTION.id} value={ALL_ACCOUNTS_OPTION.id}>
                        {ALL_ACCOUNTS_OPTION.name}
                      </Option>
                    )}
                    {accounts.map((account) => (
                      <Option key={account.id} value={account.id}>
                        {account.name}
                      </Option>
                    ))}
                  </Select>
                </div>
              </Col>

              <Col xs={24} sm={12} md={10} lg={8}>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>Date Range:</Text>
                  <RangePicker
                    value={dateRange}
                    onChange={handleDateChange}
                    format="YYYY-MM-DD"
                    style={{ width: '100%', marginTop: 8 }}
                    disabled={loading}
                  />
                </div>
              </Col>

              <Col xs={24} md={6} lg={10}>
                <div style={{ marginTop: 24 }}>
                  <Space>
                    <Button type="primary" icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
                      Refresh
                    </Button>
                    <Button onClick={handleForceRefresh} loading={loading} danger>
                      Force Refresh
                    </Button>
                  </Space>
                </div>
              </Col>
            </Row>

            {data?._source && (
              <Alert
                message={`Data Source: ${data._source}`}
                description={data._message}
                type="info"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
          </Card>

          {error && (
            <Alert message="Error" description={error} type="error" showIcon style={{ marginBottom: 24 }} />
          )}

          {accounts.length === 0 && !loadingAccounts && (
            <Alert
              message="No Predicto Accounts"
              description="You don't have access to any Predicto-enabled accounts. Please contact your administrator to set up Predicto tracking."
              type="warning"
              showIcon
            />
          )}

          {loading && !data && (
            <Card>
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>
                  <Text>Loading Predicto cost-revenue data...</Text>
                </div>
              </div>
            </Card>
          )}

          {!loading && data && data.campaign_aggregated && data.summary && (
            <>
              {/* Cost & Revenue Summary Cards */}
              <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} lg={6}>
                  <Card>
                    <Statistic
                      title="Total Cost"
                      value={data.summary.total_cost}
                      precision={2}
                      prefix="$"
                      valueStyle={{ color: '#ff4d4f', fontSize: '24px' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Card>
                    <Statistic
                      title="Total Revenue"
                      value={data.summary.total_revenue}
                      precision={2}
                      prefix="$"
                      valueStyle={{ color: '#52c41a', fontSize: '24px' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Card>
                    <Statistic
                      title="Total Profit"
                      value={data.summary.total_profit}
                      precision={2}
                      prefix="$"
                      valueStyle={{
                        color: data.summary.total_profit >= 0 ? '#52c41a' : '#ff4d4f',
                        fontSize: '24px'
                      }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Card>
                    <Statistic
                      title="Average ROI"
                      value={data.summary.average_roi}
                      precision={1}
                      suffix="%"
                      valueStyle={{
                        color: data.summary.average_roi >= 0 ? '#52c41a' : '#ff4d4f',
                        fontSize: '24px'
                      }}
                    />
                  </Card>
                </Col>
              </Row>

              {/* Account-Level Summaries (for multi-account view) */}
              {data.account_summaries && data.account_summaries.length > 0 && (
                <Card
                  title={<Title level={4}>Account-Level Performance</Title>}
                  style={{ marginBottom: 24 }}
                >
                  <Table
                    columns={[
                      {
                        title: 'Account',
                        dataIndex: 'account_name',
                        key: 'account_name',
                        fixed: 'left',
                        width: 200,
                        render: (name: string) => <Text strong>{name}</Text>,
                      },
                      {
                        title: 'Campaigns',
                        dataIndex: 'total_campaigns',
                        key: 'total_campaigns',
                        width: 100,
                        render: (count: number) => <Text>{count}</Text>,
                      },
                      {
                        title: 'Matched',
                        dataIndex: 'campaigns_matched',
                        key: 'campaigns_matched',
                        width: 100,
                        render: (matched: number, record: AccountSummary) => (
                          <Text>{matched}/{record.total_campaigns}</Text>
                        ),
                      },
                      {
                        title: 'Cost',
                        dataIndex: 'total_cost',
                        key: 'total_cost',
                        width: 120,
                        render: (cost: number) => (
                          <Text strong style={{ color: '#ff4d4f' }}>
                            ${cost.toFixed(2)}
                          </Text>
                        ),
                        sorter: (a: AccountSummary, b: AccountSummary) => a.total_cost - b.total_cost,
                        defaultSortOrder: 'descend',
                      },
                      {
                        title: 'Revenue',
                        dataIndex: 'total_revenue',
                        key: 'total_revenue',
                        width: 120,
                        render: (revenue: number) => (
                          <Text strong style={{ color: '#52c41a' }}>
                            ${revenue.toFixed(2)}
                          </Text>
                        ),
                        sorter: (a: AccountSummary, b: AccountSummary) => a.total_revenue - b.total_revenue,
                      },
                      {
                        title: 'Profit',
                        dataIndex: 'total_profit',
                        key: 'total_profit',
                        width: 120,
                        render: (profit: number) => (
                          <Text strong style={{ color: profit >= 0 ? '#52c41a' : '#ff4d4f' }}>
                            ${profit.toFixed(2)}
                          </Text>
                        ),
                        sorter: (a: AccountSummary, b: AccountSummary) => a.total_profit - b.total_profit,
                      },
                      {
                        title: 'ROI',
                        dataIndex: 'roi',
                        key: 'roi',
                        width: 100,
                        render: (roi: number) => (
                          <Text strong style={{ color: roi >= 0 ? '#52c41a' : '#ff4d4f' }}>
                            {roi.toFixed(1)}%
                          </Text>
                        ),
                        sorter: (a: AccountSummary, b: AccountSummary) => a.roi - b.roi,
                      },
                      {
                        title: 'ROAS',
                        dataIndex: 'roas',
                        key: 'roas',
                        width: 100,
                        render: (roas: number) => (
                          <Text strong style={{ color: roas >= 1 ? '#52c41a' : '#ff4d4f' }}>
                            {roas.toFixed(2)}x
                          </Text>
                        ),
                        sorter: (a: AccountSummary, b: AccountSummary) => a.roas - b.roas,
                      },
                    ]}
                    dataSource={data.account_summaries}
                    rowKey="customer_id"
                    pagination={false}
                    size="middle"
                    scroll={{ x: 900 }}
                  />
                </Card>
              )}

              {/* Cost & Revenue Table */}
              <Card title={<Title level={4}>Campaign Cost & Revenue Analysis</Title>}>
                <Table
                  columns={[
                    {
                      title: 'Campaign ID',
                      dataIndex: 'campaign_id',
                      key: 'campaign_id',
                      width: 150,
                      fixed: 'left',
                      render: (id: string) => (
                        <Text strong style={{ fontFamily: 'monospace', color: '#1890ff', fontSize: '12px' }}>
                          {id}
                        </Text>
                      ),
                    },
                    {
                      title: 'Campaign Name',
                      dataIndex: 'campaign_name',
                      key: 'campaign_name',
                      width: 200,
                      render: (name: string) => (
                        <Text>{name || '-'}</Text>
                      ),
                    },
                    {
                      title: 'Channel IDs',
                      dataIndex: 'channel_ids',
                      key: 'channel_ids',
                      width: 150,
                      render: (ids: string[]) => (
                        <Text style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                          {ids && ids.length > 0 ? ids.join(', ') : '-'}
                        </Text>
                      ),
                    },
                    {
                      title: 'Cost',
                      dataIndex: 'cost',
                      key: 'cost',
                      width: 110,
                      render: (cost: number) => (
                        <Text strong style={{ color: '#ff4d4f' }}>
                          ${cost.toFixed(2)}
                        </Text>
                      ),
                      sorter: (a: any, b: any) => a.cost - b.cost,
                    },
                    {
                      title: 'Revenue',
                      dataIndex: 'revenue',
                      key: 'revenue',
                      width: 110,
                      render: (revenue: number) => (
                        <Text strong style={{ color: '#52c41a' }}>
                          ${revenue.toFixed(2)}
                        </Text>
                      ),
                      sorter: (a: any, b: any) => a.revenue - b.revenue,
                    },
                    {
                      title: 'Profit',
                      dataIndex: 'profit',
                      key: 'profit',
                      width: 110,
                      render: (profit: number) => (
                        <Text strong style={{ color: profit >= 0 ? '#52c41a' : '#ff4d4f' }}>
                          ${profit.toFixed(2)}
                        </Text>
                      ),
                      sorter: (a: any, b: any) => a.profit - b.profit,
                      defaultSortOrder: 'descend',
                    },
                    {
                      title: 'ROI',
                      dataIndex: 'roi',
                      key: 'roi',
                      width: 100,
                      render: (roi: number) => (
                        <Text strong style={{ color: roi >= 0 ? '#52c41a' : '#ff4d4f' }}>
                          {roi.toFixed(1)}%
                        </Text>
                      ),
                      sorter: (a: any, b: any) => a.roi - b.roi,
                    },
                    {
                      title: 'ROAS',
                      dataIndex: 'roas',
                      key: 'roas',
                      width: 90,
                      render: (roas: number) => (
                        <Text strong style={{ color: roas >= 1 ? '#52c41a' : '#ff4d4f' }}>
                          {roas.toFixed(2)}x
                        </Text>
                      ),
                      sorter: (a: any, b: any) => a.roas - b.roas,
                    },
                    {
                      title: 'Clicks',
                      dataIndex: 'clicks',
                      key: 'clicks',
                      width: 90,
                      render: (clicks: number) => (
                        <Text>{clicks.toLocaleString()}</Text>
                      ),
                      sorter: (a: any, b: any) => a.clicks - b.clicks,
                    },
                    {
                      title: 'Impressions',
                      dataIndex: 'impressions',
                      key: 'impressions',
                      width: 110,
                      render: (impressions: number) => (
                        <Text>{impressions.toLocaleString()}</Text>
                      ),
                      sorter: (a: any, b: any) => a.impressions - b.impressions,
                    },
                    {
                      title: 'CTR',
                      dataIndex: 'ctr',
                      key: 'ctr',
                      width: 80,
                      render: (ctr: number) => (
                        <Text>{ctr.toFixed(2)}%</Text>
                      ),
                      sorter: (a: any, b: any) => a.ctr - b.ctr,
                    },
                    {
                      title: 'RPC',
                      dataIndex: 'rpc',
                      key: 'rpc',
                      width: 90,
                      render: (rpc: number) => (
                        <Text>${rpc.toFixed(3)}</Text>
                      ),
                      sorter: (a: any, b: any) => a.rpc - b.rpc,
                    },
                    {
                      title: 'Status',
                      key: 'status',
                      width: 120,
                      render: (_: any, record: any) => {
                        if (record.has_cost_data && record.has_revenue_data) {
                          return <Text style={{ color: '#52c41a' }}>✓ Matched</Text>;
                        } else if (record.has_cost_data) {
                          return <Text style={{ color: '#faad14' }}>Cost Only</Text>;
                        } else {
                          return <Text style={{ color: '#1890ff' }}>Revenue Only</Text>;
                        }
                      },
                      filters: [
                        { text: 'Matched', value: 'matched' },
                        { text: 'Cost Only', value: 'cost_only' },
                        { text: 'Revenue Only', value: 'revenue_only' },
                      ],
                      onFilter: (value: any, record: any) => {
                        if (value === 'matched') return record.has_cost_data && record.has_revenue_data;
                        if (value === 'cost_only') return record.has_cost_data && !record.has_revenue_data;
                        if (value === 'revenue_only') return !record.has_cost_data && record.has_revenue_data;
                        return true;
                      },
                    },
                  ]}
                  dataSource={data.campaign_aggregated}
                  rowKey="campaign_id"
                  loading={loading}
                  pagination={{
                    pageSize: 50,
                    showSizeChanger: true,
                    pageSizeOptions: ['20', '50', '100', '200'],
                    showTotal: (total) => `Total ${total} campaigns`,
                  }}
                  scroll={{ x: 1600 }}
                  size="middle"
                />
              </Card>
            </>
          )}

          {!loading && !data && !error && selectedAccount && (
            <Card>
              <Alert
                message="No Data"
                description="Click 'Refresh' to load Predicto cost-revenue data for the selected account and date range."
                type="info"
                showIcon
              />
            </Card>
          )}
        </Content>
      </Layout>
    </DashboardLayout>
  );
}
