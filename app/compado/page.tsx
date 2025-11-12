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
  Select
} from 'antd';
import {
  ReloadOutlined,
  ApiOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import CompadoCostRevenueMapping from '@/components/Compado/CompadoCostRevenueMapping';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

interface CompadoCostRevenueResponse {
  google_ads_data: any;
  compado_data: any;
  cost_revenue_mapping: any[];
  campaign_aggregated: any[];
  summary: any;
  _source: string;
  _timestamp: string;
  _message: string;
}

interface Account {
  id: string;
  name: string;
}

// Compado-enabled accounts only (accounts with Compado tracking setup)
const COMPADO_ENABLED_ACCOUNTS = [
  { id: '5416418019', name: 'Compado - UTC - 01' },
  { id: '5108802445', name: 'Compado - UTC - 02' },
  { id: '1671699399', name: 'Compado - UTC - 03' },
  { id: '9197380684', name: 'Compado - UTC - 04' },
  { id: '9669088480', name: 'Compado - UTC - 05' },
  { id: '6725067013', name: 'Compado - UTC - 06' },
  { id: '9299147464', name: 'Compado - UTC - 07' },
  { id: '2126478207', name: 'Compado - UTC - 08' },
  { id: '8711828676', name: 'Compado - UTC - 09' },
  { id: '5496110293', name: 'Compado - UTC - 10' },
  { id: '3963323643', name: 'Compado - UTC - 11' },
  { id: '1751028486', name: 'Compado - UTC - 12' },
  { id: '9248809715', name: 'Compado - UTC - 13' },
  { id: '9922466223', name: 'Compado - UTC - 14' },
  { id: '9524489917', name: 'Compado - UTC - 15' }
];

// Special "All Accounts" option for aggregated view
const ALL_ACCOUNTS_OPTION = { id: 'ALL_ACCOUNTS', name: 'All Accounts (Total)' };

export default function CompadoPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompadoCostRevenueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Default to today's date for both start and end
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
  }, [dateRange, selectedAccount]);

  const fetchAccounts = async () => {
    try {
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

      // Add "All Accounts" option at the beginning
      const accountsWithAll = [ALL_ACCOUNTS_OPTION, ...COMPADO_ENABLED_ACCOUNTS];
      setAccounts(accountsWithAll);

      // For regular users, auto-select their account (without CID_ prefix for API calls)
      if (authType === 'user' && userAccountId) {
        const accountValue = userAccountId.replace('CID_', '');
        setSelectedAccount(accountValue);
        console.log(`[COMPADO_DASHBOARD] User account auto-selected: ${accountValue}`);
      } else {
        // Admin: Auto-select "All Accounts" by default
        setSelectedAccount(ALL_ACCOUNTS_OPTION.id);
        console.log(`[COMPADO_DASHBOARD] Admin mode: All Accounts selected`);
      }

      console.log(`[COMPADO_DASHBOARD] Loaded ${COMPADO_ENABLED_ACCOUNTS.length} Compado-enabled accounts + 'All Accounts' option`);

    } catch (err) {
      console.error('[COMPADO_DASHBOARD] Error loading accounts:', err);
      setError('Failed to load Compado accounts.');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchData = async (forceRefresh: boolean = false) => {
    if (!selectedAccount) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');

      // Determine if we're fetching all accounts or a single account
      const isAllAccounts = selectedAccount === ALL_ACCOUNTS_OPTION.id;
      const accountIds = isAllAccounts
        ? COMPADO_ENABLED_ACCOUNTS.map(acc => acc.id)
        : [selectedAccount];

      console.log(`[COMPADO_DASHBOARD] Fetching data: ${startDate} to ${endDate} for ${isAllAccounts ? 'all accounts' : `account ${selectedAccount}`} (forceRefresh: ${forceRefresh})`);

      const response = await fetch('/api/compado-cost-revenue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          customerId: isAllAccounts ? undefined : selectedAccount,
          accountIds: isAllAccounts ? accountIds : undefined,
          forceRefresh  // Only force refresh when explicitly requested
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const result: CompadoCostRevenueResponse = await response.json();

      // Debug: Log the full response structure
      console.log(`[COMPADO_DASHBOARD] Full API Response:`, {
        hasCampaignAggregated: !!result.campaign_aggregated,
        campaignCount: result.campaign_aggregated?.length || 0,
        campaigns: result.campaign_aggregated,
        clickMappings: result.cost_revenue_mapping?.length || 0,
        summary: result.summary
      });

      setData(result);

      console.log(`[COMPADO_DASHBOARD] Data loaded: ${result.campaign_aggregated?.length || 0} campaigns, ${result.cost_revenue_mapping?.length || 0} click-level mappings`);

    } catch (err) {
      console.error('[COMPADO_DASHBOARD] Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]]);
    }
  };

  const handleRefresh = () => {
    fetchData(true);  // Force refresh when user explicitly clicks Refresh button
  };

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
                    Compado Cost/Revenue Analysis
                  </Title>
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', display: 'block', marginTop: '2px' }}>
                    GCLID-based mapping between Google Ads cost and Compado conversion revenue
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
              {/* Only show account selector for admins */}
              {isAdmin && (
                <Col xs={24} sm={12} md={8}>
                  <div>
                    <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                      Account
                    </Text>
                    <Select
                      value={selectedAccount}
                      onChange={setSelectedAccount}
                      style={{ width: '100%' }}
                      placeholder="Select an account"
                      loading={loadingAccounts}
                      disabled={loadingAccounts}
                      showSearch
                      filterOption={(input, option) =>
                        (option?.children as unknown as string)
                          .toLowerCase()
                          .includes(input.toLowerCase())
                      }
                    >
                      {accounts.map(account => (
                        <Option key={account.id} value={account.id}>
                          {account.name}
                        </Option>
                      ))}
                    </Select>
                  </div>
                </Col>
              )}

              <Col xs={24} sm={12} md={8}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                    Date Range
                  </Text>
                  <RangePicker
                    value={dateRange}
                    onChange={handleDateRangeChange}
                    style={{ width: '100%' }}
                    allowClear={false}
                    maxDate={dayjs()}
                    disabled={!selectedAccount}
                  />
                </div>
              </Col>

              <Col xs={24} sm={12} md={4}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                    &nbsp;
                  </Text>
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={handleRefresh}
                    loading={loading}
                    disabled={!selectedAccount}
                    style={{ width: '100%' }}
                  >
                    Refresh
                  </Button>
                </div>
              </Col>

              {data && data.campaign_aggregated && data.campaign_aggregated.length > 0 && (
                <Col xs={24} md={12}>
                  <Alert
                    message={`Loaded ${data.campaign_aggregated.length} campaigns (${data.cost_revenue_mapping?.length || 0} click-level mappings)`}
                    type="success"
                    showIcon
                  />
                </Col>
              )}
            </Row>
          </Card>

          {/* Error Display */}
          {error && (
            <Alert
              message="Error Loading Data"
              description={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: '24px' }}
            />
          )}

          {/* Loading Spinner */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <Spin size="large" tip="Loading Compado cost/revenue data..." />
            </div>
          )}

          {/* Cost/Revenue Mapping Component - Campaign Aggregated View */}
          {!loading && data && data.campaign_aggregated && data.campaign_aggregated.length > 0 && (
            <CompadoCostRevenueMapping
              data={data.campaign_aggregated}
              summary={data.summary}
              loading={loading}
            />
          )}

          {/* No Compado Data Message */}
          {!loading && data && (!data.campaign_aggregated || data.campaign_aggregated.length === 0) && (
            <Card>
              <div style={{ textAlign: 'center', padding: '50px' }}>
                <Alert
                  message="No Conversion Data Available"
                  description="Conversion tracking data will appear here once campaigns are active and generating conversions."
                  type="info"
                  showIcon
                  style={{ maxWidth: '600px', margin: '0 auto' }}
                />
              </div>
            </Card>
          )}

          {/* No Account Selected */}
          {!selectedAccount && !loadingAccounts && (
            <Card>
              <div style={{ textAlign: 'center', padding: '50px' }}>
                <Alert
                  message="Select an Account"
                  description="Please select a Google Ads account from the dropdown above to view cost/revenue data."
                  type="info"
                  showIcon
                  style={{ maxWidth: '600px', margin: '0 auto' }}
                />
              </div>
            </Card>
          )}

          {/* No Data Message */}
          {!loading && !data && !error && selectedAccount && (
            <Card>
              <div style={{ textAlign: 'center', padding: '50px' }}>
                <Text type="secondary">No data available. Please select a date range and click Refresh.</Text>
              </div>
            </Card>
          )}
        </Content>
      </Layout>
    </DashboardLayout>
  );
}
