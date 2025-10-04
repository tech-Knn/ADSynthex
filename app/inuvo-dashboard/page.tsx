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
  Spin
} from 'antd';
import { 
  ReloadOutlined, 
  DollarOutlined,
  ApiOutlined
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

interface InuvoApiResponse {
  inuvo_data: any;
  google_ads_data: any;
  cost_revenue_mapping: any[];
  summary: any;
  _source: string;
  _timestamp: string;
  _message: string;
}

export default function InuvoDashboard() {
  // State management
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InuvoApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Configuration state
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs(), // Today's start
    dayjs()  // Today's end (for today's live data)
  ]);
  const [selectedAccount, setSelectedAccount] = useState<string>('7195529443');
  const [dataType, setDataType] = useState<'realtime' | 'daily'>('realtime');

  // Initial data fetch
  useEffect(() => {
    console.log('[INUVO_DASHBOARD] useEffect triggered - fetching data...', {
      selectedAccount,
      dataType,
      dateRange: [dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')]
    });
    
    // Always fetch data when dependencies change
    fetchData();
  }, [dateRange, selectedAccount, dataType]);

  const fetchData = async () => {
    console.log('[INUVO_DASHBOARD] fetchData called');
    setLoading(true);
    setError(null);
    
    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      
      console.log(`[INUVO_DASHBOARD] Fetching data: ${startDate} to ${endDate}, Account: ${selectedAccount}, Type: ${dataType}`);
      
      const response = await fetch('/api/inuvo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          customerId: selectedAccount, // Always use the specific account
          dataType,
          useMockData: false // Always use live data
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const result: InuvoApiResponse = await response.json();
      setData(result);
      
      console.log(`[INUVO_DASHBOARD] Data loaded: ${result.cost_revenue_mapping.length} mappings`);
      
    } catch (err) {
      console.error('[INUVO_DASHBOARD] Error fetching data:', err);
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
    fetchData();
  };

  const handleAccountChange = (value: string) => {
    setSelectedAccount(value);
  };

  const handleDataTypeChange = (value: 'realtime' | 'daily') => {
    setDataType(value);
  };

  const accounts = [
    { id: '7195529443', name: 'Inuvo - Account - 02 - GMT (719-552-9443)' },
    { id: '9833281050', name: 'Inuvo - Account 3 - PST (GMT -8:00)' },
    { id: '7616718892', name: 'Inuvo - Account 2 - PST (GMT -8:00)' }
  ];

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
                    TKID-based mapping between Google Ads cost and Inuvo revenue
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
                  />
                </div>
              </Col>
              
              <Col xs={24} sm={12} md={8} lg={4}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                    Account
                  </Text>
                  <Select
                    value={selectedAccount}
                    onChange={handleAccountChange}
                    style={{ width: '100%' }}
                  >
                    {accounts.map(account => (
                      <Option key={account.id} value={account.id}>
                        {account.name}
                      </Option>
                    ))}
                  </Select>
                </div>
              </Col>
              
              <Col xs={24} sm={12} md={8} lg={4}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: '8px' }}>
                    Data Type
                  </Text>
                  <Select
                    value={dataType}
                    onChange={handleDataTypeChange}
                    style={{ width: '100%' }}
                  >
                    <Option value="realtime">Realtime</Option>
                    <Option value="daily">Daily</Option>
                  </Select>
                </div>
              </Col>
              
              <Col xs={24} sm={12} md={8} lg={4}>
                <div style={{ paddingTop: '24px' }}>
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={handleRefresh}
                    loading={loading}
                    style={{ 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                      borderColor: 'transparent',
                      color: 'white',
                      fontWeight: 500,
                      boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
                      width: '100%',
                      height: '40px'
                    }}
                  >
                    Refresh Data
                  </Button>
                </div>
              </Col>

            </Row>
          </Card>

          {/* Status Messages */}
          {error && (
            <Alert
              message="Error Loading Data"
              description={error}
              type="error"
              showIcon
              style={{ marginBottom: '24px' }}
              action={
                <Button size="small" onClick={handleRefresh}>
                  Retry
                </Button>
              }
            />
          )}

          {data?._source === 'mock_fallback' && (
            <Alert
              message="Using Mock Data"
              description={data._message}
              type="warning"
              showIcon
              style={{ marginBottom: '24px' }}
            />
          )}

          {data?._message && data._source !== 'mock_fallback' && (
            <Alert
              message="Data Status"
              description={data._message}
              type="info"
              showIcon
              style={{ marginBottom: '24px' }}
            />
          )}

          {/* Main Content */}
          <Spin spinning={loading} size="large">
            {data ? (
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
              />
            ) : (
              <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
                <DollarOutlined style={{ fontSize: '64px', color: '#d9d9d9', marginBottom: '16px' }} />
                <Title level={4} type="secondary">No Data Available</Title>
                <Paragraph type="secondary">
                  Use "Refresh Data" button in the controls above to load cost/revenue mappings
                </Paragraph>
              </Card>
            )}
          </Spin>
        </Content>
      </Layout>
    </DashboardLayout>
  );
}

