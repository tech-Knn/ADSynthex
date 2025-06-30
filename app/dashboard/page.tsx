'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Layout, Typography, DatePicker, Button, Skeleton, Row, Col, App } from 'antd';
import { CalendarOutlined, ReloadOutlined, BarChartOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);
import { useSearchParams } from 'next/navigation';
import SummaryCards from '../../components/Dashboard/SummaryCards';
import DataTable from '../../components/Dashboard/DataTable';
import { AdsComArticleData } from '../../lib/adscom-api';
import { GoogleAdsAd } from '../../lib/google-ads-api';

// Declare custom window property for TypeScript
declare global {
  interface Window {
    __selectedCustomerId?: string | null;
  }
}

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// Mock API functions since they don't exist in the codebase
const fetchAdsComArticleData = async (startDate: string, endDate: string): Promise<AdsComArticleData[]> => {
  // This would be replaced with an actual API call
  try {
    console.log(`Fetching Ads.com data for date range: ${startDate} to ${endDate}`);
    const timestamp = new Date().getTime(); // Add timestamp to prevent caching
    const response = await fetch(`/api/adscom?t=${timestamp}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store'
      },
      body: JSON.stringify({ startDate, endDate }),
      cache: 'no-store'
    });
    
    if (!response.ok) {
      console.error(`Revenue API error: ${response.status} ${response.statusText}`);
      throw new Error(`Revenue API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Ads.com API response:', data);
    return data.data || [];
  } catch (error) {
    console.error('Error fetching Ads.com data:', error);
    throw error;
  }
};

const fetchGoogleAdsData = async (startDate: string, endDate: string): Promise<GoogleAdsAd[]> => {
  // This would be replaced with an actual API call
  try {
    console.log(`Fetching Google Ads data for date range: ${startDate} to ${endDate}`);
    const timestamp = new Date().getTime(); // Add timestamp to prevent caching
    const response = await fetch(`/api/google-ads?t=${timestamp}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store'
      },
      body: JSON.stringify({ startDate, endDate }),
      cache: 'no-store'
    });
    
    if (!response.ok) {
      console.error(`Cost API error: ${response.status} ${response.statusText}`);
      throw new Error(`Cost API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Google Ads API response:', data);
    return data.ads || [];
  } catch (error) {
    console.error('Error fetching Google Ads data:', error);
    throw error;
  }
};

function DashboardContent() {
  const [loading, setLoading] = useState<boolean>(false);
  const [revenueData, setRevenueData] = useState<AdsComArticleData[]>([]);
  const [costData, setCostData] = useState<GoogleAdsAd[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  
  // Default to today initially 
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs.utc(),
    dayjs.utc()
  ]);
  
  // Track selected period for date filters
  const [selectedPeriod, setSelectedPeriod] = useState<string>('today');
  
  const { message } = App.useApp();

  const makeApiCall = async (endpoint: string, params: any) => {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    
    try {
      // Get the current customer ID from window if available
      const currentCustomerId = typeof window !== 'undefined' ? window.__selectedCustomerId : selectedCustomerId;
      
      console.log(`API call to ${endpoint}:`, params, 'with customerId:', currentCustomerId);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({
          ...params,
          customerId: currentCustomerId,
          _timestamp: timestamp // Add timestamp parameter
        }),
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error);
      throw error;
    }
  };

  const fetchData = async (startDate: string, endDate: string, customerId?: string | null) => {
    const messageKey = 'dataFetch';

    setLoading(true);
    try {
      // Use makeApiCall instead of direct fetch
      const [adscomData, googleAdsData] = await Promise.all([
        makeApiCall('/api/adscom', { startDate, endDate, customerId }),
        makeApiCall('/api/google-ads', { startDate, endDate, customerId })
      ]);
      
      // Handle null data safely
      const articleData = adscomData && adscomData.data ? adscomData.data : [];
      const adsData = googleAdsData && googleAdsData.ads ? googleAdsData.ads : [];
      
      if (articleData.length === 0) {
        message.warning('No revenue data found for the selected date range.');
      }
      
      if (adsData.length === 0) {
        message.warning('No cost data found for the selected date range.');
      }
      
      setRevenueData(articleData);
      setCostData(adsData);
      
      // Success toast (no persistent loading toast anymore)
      if (customerId) {
        const customerName = getCustomerNameById(customerId);
        message.success({ key: messageKey, content: `Data for ${customerName} loaded successfully`, duration: 2 });
      } else {
        message.success({ key: messageKey, content: 'Data loaded successfully for all accounts', duration: 2 });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error({ key: messageKey, content: 'Failed to load data', duration: 2 });
    } finally {
      setLoading(false);
    }
  };

  // Get customer name by ID
  const getCustomerNameById = (customerId: string | null): string => {
    if (!customerId) return 'All Accounts';
    
    const customerIdKey = `CID_${customerId}`;
    const account = CUSTOMER_ACCOUNTS.find(acc => acc.id === customerIdKey);
    return account ? account.name : 'Unknown Account';
  };

  // Helper to handle account selection
  const handleAccountChange = (customerId: string | null) => {
    setSelectedCustomerId(customerId);
    
    // Refresh data with new customer ID filter
    const startDate = dateRange[0].utc().format('YYYY-MM-DD');
    const endDate = dateRange[1].utc().format('YYYY-MM-DD');
    
    // Direct call with the customerId parameter
    fetchData(startDate, endDate, customerId);
  };

  useEffect(() => {
    // Always start with Today's data
    const today = dayjs.utc();
    console.log('Initial load - forcing Today:', today.format('YYYY-MM-DD'));
    setDateRange([today, today]);
    
    // Check for account parameter in URL
    const accountParam = searchParams?.get('account') || null;
    
    let customerId = null;
    
    // Check if there's an account parameter in URL
    if (accountParam) {
      console.log('Found account parameter in URL:', accountParam);
      // If it's a CID_ prefix, extract just the number
      customerId = accountParam.startsWith('CID_') 
        ? accountParam.replace('CID_', '') 
        : accountParam;
        
      console.log('Using account ID from URL:', customerId);
      
      // Set the selected customer ID
      setSelectedCustomerId(customerId);
      
      // Update window.__selectedCustomerId for consistency
      if (typeof window !== 'undefined') {
        window.__selectedCustomerId = customerId;
      }
    } 
    // If no account param, check if there's already a selected account ID in the window object
    else if (typeof window !== 'undefined' && window.__selectedCustomerId !== undefined) {
      customerId = window.__selectedCustomerId;
      setSelectedCustomerId(customerId);
    }
    
    // Use the customer ID when fetching data initially
    fetchData(today.utc().format('YYYY-MM-DD'), today.utc().format('YYYY-MM-DD'), customerId);
    
    // Listen for account changes from the layout component
    const handleAccountChangedEvent = (event: CustomEvent) => {
      const newCustomerId = event.detail;
      console.log('Account changed event received:', newCustomerId);
      
      // Update the selected customer ID state
      setSelectedCustomerId(newCustomerId);
      
      // Refresh data with new customer ID filter
      const startDate = dateRange[0].utc().format('YYYY-MM-DD');
      const endDate = dateRange[1].utc().format('YYYY-MM-DD');
      
      // Directly call fetchData with the new customerId to avoid state update delays
      fetchData(startDate, endDate, newCustomerId);
    };
    
    // Add event listener
    window.addEventListener('accountChanged', handleAccountChangedEvent as EventListener);
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('accountChanged', handleAccountChangedEvent as EventListener);
    };
  }, [searchParams]); // Add searchParams as dependency so the effect runs when URL changes

  const handleDateChange = (
    dates: [Dayjs | null, Dayjs | null] | null,
    dateStrings: [string, string]
  ) => {
    if (dates && dates[0] && dates[1]) {
      // Calculate difference in days
      const diffDays = dates[1].diff(dates[0], 'days');
      
      // Warn if range is too long for Ads.com API
      if (diffDays > 30) {
        message.warning('Very large date ranges may cause performance issues.');
      }
      
      setDateRange([dates[0], dates[1]]);
      // Fetch data whenever date range changes
      setTimeout(() => fetchData(dates[0]!.utc().format('YYYY-MM-DD'), dates[1]!.utc().format('YYYY-MM-DD'), selectedCustomerId), 100);
    }
  };

  // Helper function to get customer accounts data
  const CUSTOMER_ACCOUNTS = [
    {
      id: 'all',
      name: 'All Accounts',
      value: null
    },
    {
      id: 'CID_3146253756',
      name: 'Ads.com - RSOC - UTC - 04',
      value: '3146253756'
    },
    {
      id: 'CID_5723554317',
      name: 'Ads.com - RSOC - UTC - 03',
      value: '5723554317'
    },
    {
      id: 'CID_9071440966',
      name: 'Ads.com - RSOC - UTC - 02',
      value: '9071440966'
    },
    {
      id: 'CID_8677814915',
      name: 'Ads.com - RSOC - IST',
      value: '8677814915'
    },
    {
      id: 'CID_4277350349',
      name: 'RSOC - UTC - Ads.com',
      value: '4277350349'
    },
    {
      id: 'CID_5857090949',
      name: 'Ads.com - RSOC - UTC - 05',
      value: '5857090949'
    },
    {
      id: 'CID_6201189752',
      name: 'Ads.com - RSOC - UTC - 06',
      value: '6201189752'
    },
    {
      id: 'CID_4071621621',
      name: 'Ads.com - RSOC - UTC - 07',
      value: '4071621621'
    },
    {
      id: 'CID_7579121709',
      name: 'Ads.com - RSOC - UTC - 08',
      value: '7579121709'
    }
  ];

  const handlePeriodSelect = (period: string) => {
    // Only proceed if period is different or we're forcing a refresh
    if (selectedPeriod === period) {
      // Same period selected, force refresh
      const { start, end } = getDateRangeForPeriod(period);
      const startDate = start.utc().format('YYYY-MM-DD');
      const endDate = end.utc().format('YYYY-MM-DD');
      fetchData(startDate, endDate, selectedCustomerId);
      return;
    }
    
    setSelectedPeriod(period);
    const { start, end } = getDateRangeForPeriod(period);
    const startDate = start.utc().format('YYYY-MM-DD');
    const endDate = end.utc().format('YYYY-MM-DD');
    setDateRange([start, end]);
    fetchData(startDate, endDate, selectedCustomerId);
  };

  const handleRefresh = () => {
    const startDate = dateRange[0].utc().format('YYYY-MM-DD');
    const endDate = dateRange[1].utc().format('YYYY-MM-DD');
    fetchData(startDate, endDate, selectedCustomerId);
  };

  // Helper to get date ranges for different periods
  const getDateRangeForPeriod = (period: string): { start: Dayjs; end: Dayjs } => {
    const today = dayjs.utc();
    
    switch (period) {
      case 'today':
        return { start: today, end: today };
      case 'yesterday':
        const yesterday = today.subtract(1, 'day');
        return { start: yesterday, end: yesterday };
      case 'last3days':
        return {
          start: today.subtract(2, 'day'),
          end: today
        };
      default:
        return { start: today, end: today };
    }
  };

  // Now fix the existing helper functions to use the new pattern
  const selectToday = () => {
    handlePeriodSelect('today');
  };
  
  const selectYesterday = () => {
    handlePeriodSelect('yesterday');
  };
  
  const selectLast3Days = () => {
    handlePeriodSelect('last3days');
  };

  return (
    <App>
      <Layout className="dashboard-layout">
        <Header className="dashboard-header">
          <div className="header-content">
            <div className="logo-container">
              <div className="logo-icon">
                <BarChartOutlined />
              </div>
              <div className="logo-text">AdSyntheX</div>
            </div>
            
            <div className="header-controls">
              <div className="date-picker-wrapper">
                <CalendarOutlined className="date-picker-icon" />
                <RangePicker 
                  value={dateRange}
                  onChange={handleDateChange}
                  allowClear={false}
                  className="date-range-picker"
                />
              </div>
              <div className="quick-date-buttons">
                <Button 
                  size="small"
                  onClick={selectToday}
                  className="quick-date-button"
                >
                  Today
                </Button>
                <Button 
                  size="small"
                  onClick={selectYesterday}
                  className="quick-date-button"
                >
                  Yesterday
                </Button>
                <Button 
                  size="small"
                  onClick={selectLast3Days} 
                  className="quick-date-button"
                >
                  Last 3 Days
                </Button>
              </div>
              <Button 
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                loading={loading}
                className="refresh-button"
              >
                Refresh Data
              </Button>
            </div>
          </div>
        </Header>
        
        <Content className="dashboard-content">
          <div className="page-header">
            <div>
              <Title level={2}>
                Performance Dashboard
                {selectedCustomerId && (
                  <span style={{ fontWeight: 'normal', fontSize: '0.8em', marginLeft: '12px' }}>
                    ({getCustomerNameById(selectedCustomerId)})
                  </span>
                )}
              </Title>
              <Text type="secondary">
                Data from {dateRange[0].format('MMM D, YYYY')} to {dateRange[1].format('MMM D, YYYY')}
              </Text>
            </div>
          </div>
          
          {loading ? (
            <div className="loading-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
              <div className="modern-loader-wrapper">
                <div className="modern-loader" aria-label="Loading indicator" role="status">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
                <Title level={5} style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Loading…</Title>
              </div>
            </div>
          ) : (
            <>
              <SummaryCards 
                revenueData={revenueData} 
                costData={costData} 
              />
              <DataTable 
                revenueData={revenueData}
                costData={costData}
              />
            </>
          )}
        </Content>
        
        <style jsx global>{`
          .dashboard-layout {
            min-height: 100vh;
            background-color: var(--background-color);
          }
          
          .dashboard-header {
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            padding: 0;
            height: var(--header-height);
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            display: flex;
            align-items: center;
          }
          
          .header-content {
            max-width: var(--content-width);
            width: 100%;
            margin: 0 auto;
            padding: 0 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .logo-container {
            display: flex;
            align-items: center;
          }
          
          .logo-icon {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: white;
            margin-right: 12px;
            backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.3);
          }
          
          .logo-text {
            font-size: 20px;
            font-weight: 700;
            color: white;
            letter-spacing: 0.5px;
          }
          
          .header-controls {
            display: flex;
            align-items: center;
          }
          
          .date-picker-wrapper {
            position: relative;
            margin-right: 16px;
          }
          
          .date-picker-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: rgba(255, 255, 255, 0.8);
            z-index: 1;
          }
          
          .date-range-picker {
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: var(--border-radius-sm);
            color: white;
            padding-left: 36px;
            backdrop-filter: blur(4px);
          }
          
          .date-range-picker:hover {
            background: rgba(255, 255, 255, 0.25);
          }
          
          .date-range-picker .ant-picker-input > input {
            color: white;
          }
          
          .date-range-picker .ant-picker-separator,
          .date-range-picker .ant-picker-suffix {
            color: rgba(255, 255, 255, 0.8);
          }
          
          .refresh-button {
            background: rgba(255, 255, 255, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: white;
            backdrop-filter: blur(4px);
          }
          
          .refresh-button:hover {
            background: rgba(255, 255, 255, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.4);
          }
          
          .dashboard-content {
            max-width: var(--content-width);
            margin: 0 auto;
            padding: 32px 24px;
            width: 100%;
          }
          
          .page-header {
            margin-bottom: 32px;
          }
          
          .page-header h2 {
            margin-bottom: 4px;
            font-weight: 700;
          }
          
          .loading-container {
            width: 100%;
          }
          
          .skeleton-card {
            height: 140px;
            border-radius: var(--border-radius);
            overflow: hidden;
            box-shadow: var(--card-shadow);
            background: white;
            padding: 24px;
          }
          
          .skeleton-table {
            margin-top: 32px;
            border-radius: var(--border-radius);
            overflow: hidden;
            box-shadow: var(--card-shadow);
            background: white;
            padding: 24px;
          }
          
          .quick-date-buttons {
            display: flex;
            gap: 8px;
            margin-right: 16px;
          }
          
          .quick-date-button {
            border-radius: 4px;
          }
          
          /* Responsive styles */
          @media (max-width: 768px) {
            .header-content {
              flex-direction: column;
              padding: 12px 24px;
            }
            
            .dashboard-header {
              height: auto;
              padding: 12px 0;
            }
            
            .logo-container {
              margin-bottom: 12px;
            }
            
            .header-controls {
              width: 100%;
              flex-direction: column;
            }
            
            .date-picker-wrapper {
              width: 100%;
              margin-right: 0;
              margin-bottom: 12px;
            }
            
            .date-range-picker {
              width: 100%;
            }
            
            .quick-date-buttons {
              margin-right: 0;
              margin-bottom: 8px;
            }
            
            .refresh-button {
              width: 100%;
            }
          }
          
          /* Modern bouncing dots loader */
          .modern-loader-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          
          .modern-loader {
            display: flex;
            gap: 12px;
          }
          
          .modern-loader .dot {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: var(--primary-color);
            animation: dotBounce 0.6s infinite ease-in-out alternate;
          }
          
          .modern-loader .dot:nth-child(2) {
            animation-delay: 0.2s;
          }
          
          .modern-loader .dot:nth-child(3) {
            animation-delay: 0.4s;
          }
          
          @keyframes dotBounce {
            0% {
              transform: translateY(0);
              opacity: 1;
            }
            100% {
              transform: translateY(-10px);
              opacity: 0.7;
            }
          }
        `}</style>
      </Layout>
    </App>
  );
}

// Add loading fallback component
function DashboardLoading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: '20px' }}>Loading dashboard...</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
} 