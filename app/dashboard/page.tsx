'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Typography, DatePicker, Button, Skeleton, Row, Col, App } from 'antd';
import { CalendarOutlined, ReloadOutlined, BarChartOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import SummaryCards from '../../components/Dashboard/SummaryCards';
import DataTable from '../../components/Dashboard/DataTable';
import { AdsComArticleData } from '../../lib/adscom-api';
import { GoogleAdsAd } from '../../lib/google-ads-api';

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

export default function Dashboard() {
  const [loading, setLoading] = useState<boolean>(false);
  const [revenueData, setRevenueData] = useState<AdsComArticleData[]>([]);
  const [costData, setCostData] = useState<GoogleAdsAd[]>([]);
  
  // Default to today initially 
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs(),
    dayjs()
  ]);
  
  // Track selected period for date filters
  const [selectedPeriod, setSelectedPeriod] = useState<string>('today');
  
  const { message } = App.useApp();

  const makeApiCall = async (endpoint: string, params: any) => {
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    
    try {
      console.log(`API call to ${endpoint}:`, params);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({
          ...params,
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

  const fetchData = async (startDate: string, endDate: string) => {
    setLoading(true);
    try {
      // Use makeApiCall instead of direct fetch
      const [adscomData, googleAdsData] = await Promise.all([
        makeApiCall('/api/adscom', { startDate, endDate }),
        makeApiCall('/api/google-ads', { startDate, endDate })
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
      message.success('Data loaded successfully');
    } catch (error) {
      console.error('Error fetching data:', error);
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Always start with Today's data
    const today = dayjs();
    console.log('Initial load - forcing Today:', today.format('YYYY-MM-DD'));
    setDateRange([today, today]);
    fetchData(today.format('YYYY-MM-DD'), today.format('YYYY-MM-DD'));
  }, []);

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
      setTimeout(() => fetchData(dates[0]!.format('YYYY-MM-DD'), dates[1]!.format('YYYY-MM-DD')), 100); // Short timeout to ensure state is updated
    }
  };

  const handlePeriodSelect = (period: string) => {
    // Only proceed if period is different or we're forcing a refresh
    if (selectedPeriod === period) {
      // Same period selected, force refresh
      const { start, end } = getDateRangeForPeriod(period);
      const startDate = start.format('YYYY-MM-DD');
      const endDate = end.format('YYYY-MM-DD');
      fetchData(startDate, endDate);
      return;
    }
    
    setSelectedPeriod(period);
    const { start, end } = getDateRangeForPeriod(period);
    const startDate = start.format('YYYY-MM-DD');
    const endDate = end.format('YYYY-MM-DD');
    setDateRange([start, end]);
    fetchData(startDate, endDate);
  };

  const handleRefresh = () => {
    const startDate = dateRange[0].format('YYYY-MM-DD');
    const endDate = dateRange[1].format('YYYY-MM-DD');
    fetchData(startDate, endDate);
  };

  // Helper to get date ranges for different periods
  const getDateRangeForPeriod = (period: string): { start: Dayjs; end: Dayjs } => {
    const today = dayjs();
    
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
              <Title level={2}>Performance Dashboard</Title>
                              <Text type="secondary">
                Data from {dateRange[0].format('MMM D, YYYY')} to {dateRange[1].format('MMM D, YYYY')}
              </Text>
            </div>
          </div>
          
          {loading ? (
            <div className="loading-container">
              <Row gutter={[24, 24]}>
                {[1, 2, 3, 4].map(i => (
                  <Col xs={24} sm={12} md={12} lg={6} key={i}>
                    <Skeleton active paragraph={{ rows: 2 }} className="skeleton-card" />
                  </Col>
                ))}
              </Row>
              <Skeleton active paragraph={{ rows: 10 }} className="skeleton-table" />
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
            
            .refresh-button {
              width: 100%;
            }
          }
        `}</style>
      </Layout>
    </App>
  );
} 