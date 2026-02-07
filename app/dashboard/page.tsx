'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { Layout, Typography, DatePicker, Button, Skeleton, Row, Col, App, Badge, Switch, Tooltip } from 'antd';
import { CalendarOutlined, ReloadOutlined, BarChartOutlined, SyncOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(utc);
dayjs.extend(relativeTime);
import { useSearchParams } from 'next/navigation';
import SummaryCards from '../../components/Dashboard/SummaryCards';
import DataTable from '../../components/Dashboard/DataTable';
import { AdsComArticleData } from '../../lib/adscom-api';
import { GoogleAdsAd } from '../../lib/google-ads-api';
import styles from './dashboard.module.css';
import NotesProvider from '../../components/Providers/NotesProvider';

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
  try {
    console.log(` Fetching PRODUCTION Google Ads data (Google-compliant) for date range: ${startDate} to ${endDate}`);
    const startTime = Date.now();
    
    // Using Google-compliant production endpoint with bulletproof rate limiting
    const response = await fetch('/api/google-ads-production', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ startDate, endDate })
    });
    
    if (!response.ok) {
      console.error(`Production API error: ${response.status} ${response.statusText}`);
      throw new Error(`Production API error: ${response.status}`);
    }
    
    const data = await response.json();
    const loadTime = Date.now() - startTime;
    
    // Log performance and Google compliance status
    console.log(`Production API response in ${loadTime}ms:`, {
      source: data._source,
      systemHealth: data._systemHealth?.systemHealth,
      quotaUsage: data._quotaStatus?.usagePercentage,
      adCount: data.ads?.length || 0,
      totalCost: data.total_cost,
      googleCompliant: true
    });
    
    // Show user-friendly status messages
    if (data._source === 'cache') {
      console.log(` INSTANT LOAD: Served from cache in ${loadTime}ms (Google rate limits respected)`);
    } else if (data._source === 'api') {
      console.log(` FRESH DATA: Fetched from Google API in ${loadTime}ms (rate limit compliant)`);
    } else if (data._source === 'stale') {
      console.log(` BACKUP DATA: Serving stale cache while Google API recovers`);
    }
    
    return data.ads || [];
  } catch (error) {
    console.error('Error fetching production Google Ads data:', error);
    throw error;
  }
};

function DashboardContent() {
  const [loading, setLoading] = useState<boolean>(false);
  const [revenueData, setRevenueData] = useState<AdsComArticleData[]>([]);
  const [costData, setCostData] = useState<GoogleAdsAd[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [nextUpdateIn, setNextUpdateIn] = useState<number | null>(null);
  // EMERGENCY FIX 2026-02-07: Disable auto-refresh by default to prevent quota exhaustion
  // Previous 5-min auto-refresh was causing 136K+ daily API calls (10K limit exceeded by 1,262%)
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const autoRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Minimum auto-refresh interval increased from 5min to 30min
  const MIN_AUTO_REFRESH_INTERVAL = 1800; // 30 minutes in seconds
  const searchParams = useSearchParams();
  
  // Default to today initially using local timezone (avoid UTC shift)
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
      // Use makeApiCall with Google-compliant production endpoint
      const [adscomData, googleAdsData] = await Promise.all([
        makeApiCall('/api/adscom', { startDate, endDate, customerId }),
        makeApiCall('/api/google-ads-production', { startDate, endDate, customerId })
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
      
      // Store update time information
      if (adscomData && adscomData.lastUpdated) {
        console.log(`Received update info: Last updated at ${new Date(adscomData.lastUpdated).toLocaleTimeString()}, next update in ${adscomData.nextUpdateIn || 'unknown'} seconds`);
        
        setLastUpdated(adscomData.lastUpdated);
        setNextUpdateIn(adscomData.nextUpdateIn || null);
        
        // Set up auto-refresh timer if enabled (with minimum 30-minute interval)
        if (autoRefresh && adscomData.nextUpdateIn && adscomData.nextUpdateIn > 0) {
          const refreshInterval = Math.max(adscomData.nextUpdateIn, MIN_AUTO_REFRESH_INTERVAL);
          console.log(`Setting up auto-refresh timer for ${refreshInterval} seconds from now (minimum: ${MIN_AUTO_REFRESH_INTERVAL}s)`);
          scheduleNextRefresh(refreshInterval);
        } else if (autoRefresh && (!adscomData.nextUpdateIn || adscomData.nextUpdateIn <= 0)) {
          // If nextUpdateIn is missing or zero, use minimum interval (30 minutes, not 5)
          console.log(`No valid nextUpdateIn received, setting default refresh interval (${MIN_AUTO_REFRESH_INTERVAL/60} minutes)`);
          scheduleNextRefresh(MIN_AUTO_REFRESH_INTERVAL);
        }
      } else {
        console.warn('No update time information received from API');
        
        // If no lastUpdated info is available, calculate based on current time
        const now = new Date();
        const minutes = now.getMinutes();
        const lastUpdateMinute = Math.floor(minutes / 15) * 15;
        
        const lastUpdate = new Date(now);
        lastUpdate.setMinutes(lastUpdateMinute);
        lastUpdate.setSeconds(0);
        lastUpdate.setMilliseconds(0);
        
        const nextUpdateIn = ((15 - (minutes % 15)) * 60) - now.getSeconds();
        
        console.log(`Calculated update times: Last updated at ${lastUpdate.toLocaleTimeString()}, next update in ${nextUpdateIn} seconds`);
        
        setLastUpdated(lastUpdate.toISOString());
        setNextUpdateIn(nextUpdateIn);

        // Set up auto-refresh timer if enabled (with minimum interval)
        if (autoRefresh) {
          const refreshInterval = Math.max(nextUpdateIn, MIN_AUTO_REFRESH_INTERVAL);
          scheduleNextRefresh(refreshInterval);
        }
      }
      
      // Success toast
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
  
  // Schedule the next auto-refresh
  const scheduleNextRefresh = (seconds: number) => {
    // Clear any existing timer
    if (autoRefreshTimerRef.current) {
      clearTimeout(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }
    
    if (seconds <= 0) {
      // If time is already up, refresh immediately
      console.log('AUTO-REFRESH: Time is up, refreshing immediately');
      handleRefresh();
      return;
    }
    
    // Add a small buffer (2 seconds) to ensure we get the fresh data
    const refreshTime = (seconds + 2) * 1000;
    
    console.log(`AUTO-REFRESH: Scheduled next refresh in ${refreshTime/1000} seconds (${new Date(Date.now() + refreshTime).toLocaleTimeString()})`);
    
    // Set the new timer
    autoRefreshTimerRef.current = setTimeout(() => {
      console.log(`AUTO-REFRESH: Executing refresh at ${new Date().toLocaleTimeString()}`);
      message.info({
        content: 'Auto-refreshing data from Ads.com...',
        duration: 2,
        icon: <SyncOutlined spin />
      });
      handleRefresh();
    }, refreshTime);
  };
  
  // Toggle auto-refresh
  const toggleAutoRefresh = (checked: boolean) => {
    setAutoRefresh(checked);
    console.log(`AUTO-REFRESH: ${checked ? 'Enabled' : 'Disabled'}`);
    
    if (!checked && autoRefreshTimerRef.current) {
      // Clear the timer if auto-refresh is disabled
      clearTimeout(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
      console.log('AUTO-REFRESH: Timer cleared');
    } else if (checked && nextUpdateIn && nextUpdateIn > 0) {
      // Set up the timer if auto-refresh is enabled
      console.log(`AUTO-REFRESH: Setting up timer with ${nextUpdateIn} seconds until next update`);
      scheduleNextRefresh(nextUpdateIn);
      message.success({
        content: `Auto-refresh enabled. Next update in ${formatNextUpdate()}`,
        duration: 3
      });
    }
  };

  // Get customer name by ID
  const getCustomerNameById = (customerId: string | null): string => {
    if (!customerId) return 'All Accounts';

    // Search by value field (numeric ID) instead of id field (CID_ prefixed)
    const account = CUSTOMER_ACCOUNTS.find(acc => acc.value === customerId);
    return account ? account.name : 'Unknown Account';
  };

  // Helper to handle account selection
  const handleAccountChange = (customerId: string | null) => {
    setSelectedCustomerId(customerId);

    // DISABLED AUTO-FETCH: User must click Refresh button to load data
    console.log(`Account changed to: ${customerId}. Click Refresh to load data.`);
  };

  useEffect(() => {
    // Always start with Today's data
    // Use local date to respect user-selected calendar values
    const today = dayjs();
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
    
    // DISABLED AUTO-FETCH: User must click Refresh button to load data
    console.log('Dashboard loaded. Click Refresh to load data.');
    
    // Listen for account changes from the layout component
    const handleAccountChangedEvent = (event: CustomEvent) => {
      const newCustomerId = event.detail;
      console.log('Account changed event received:', newCustomerId);

      // Update the selected customer ID state
      setSelectedCustomerId(newCustomerId);

      // DISABLED AUTO-FETCH: User must click Refresh button to load data
      console.log(`Account changed to: ${newCustomerId}. Click Refresh to load data.`);
    };
    
    // Add event listener
    window.addEventListener('accountChanged', handleAccountChangedEvent as EventListener);
    
    // Clean up function
    return () => {
      window.removeEventListener('accountChanged', handleAccountChangedEvent as EventListener);

      // Clear any active auto-refresh timer
      if (autoRefreshTimerRef.current) {
        clearTimeout(autoRefreshTimerRef.current);
      }

      // Clear any active debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchParams]); // Add searchParams as dependency so the effect runs when URL changes

  // Separate useEffect to handle auto-refresh setup and countdown
  useEffect(() => {
    // If we have nextUpdateIn data and auto-refresh is enabled, set up the timer
    if (autoRefresh && nextUpdateIn !== null) {
      console.log(`AUTO-REFRESH: Initial setup with ${nextUpdateIn} seconds until next update`);
      scheduleNextRefresh(nextUpdateIn);
      
      // Set up a countdown timer to update the UI every second
      const countdownInterval = setInterval(() => {
        setNextUpdateIn(prev => {
          if (prev === null) return null;
          
          const newValue = prev - 1;
          // When countdown reaches 0, clear the interval (refresh will be handled by the timeout)
          if (newValue <= 0) {
            clearInterval(countdownInterval);
            // Double-check that refresh happens
            console.log('AUTO-REFRESH: Countdown reached zero, triggering refresh');
            // Small delay to avoid race conditions
            setTimeout(() => {
              if (!autoRefreshTimerRef.current) {
                console.log('AUTO-REFRESH: Backup refresh triggered');
                handleRefresh();
              }
            }, 500);
          }
          return newValue;
        });
      }, 1000);
      
      // Clean up function
      return () => {
        clearInterval(countdownInterval);
      };
    }
    
    // Clean up function
    return () => {
      if (autoRefreshTimerRef.current) {
        console.log('AUTO-REFRESH: Cleaning up timer on unmount');
        clearTimeout(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [nextUpdateIn, autoRefresh]); // Re-run when these values change

  // Debounce timer for date/account changes to prevent rapid-fire API calls
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

      // DISABLED AUTO-FETCH: User must click Refresh button to load data
      console.log(`Date range changed to: ${dates[0].format('YYYY-MM-DD')} - ${dates[1].format('YYYY-MM-DD')}. Click Refresh to load data.`);
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
      id: 'CID_8677814915',
      name: 'Ads.com - RSOC - IST',
      value: '8677814915'
    },
    {
      id: 'CID_9071440966',
      name: 'Ads.com - RSOC - UTC - 02',
      value: '9071440966'
    },
    {
      id: 'CID_5723554317',
      name: 'Ads.com - RSOC - UTC - 03',
      value: '5723554317'
    },
    {
      id: 'CID_3146253756',
      name: 'Ads.com - RSOC - UTC - 04',
      value: '3146253756'
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
    },
    {
      id: 'CID_1918795911',
      name: 'Ads.com - RSOC - UTC - 09',
      value: '1918795911'
    },
    {
      id: 'CID_2849704713',
      name: 'Ads.com - RSOC - UTC - 10',
      value: '2849704713'
    },
    {
      id: 'CID_7605096292',
      name: 'Ads.com - RSOC - UTC - 11',
      value: '7605096292'
    },
    {
      id: 'CID_5719842337',
      name: 'Ads.com - RSOC - UTC - 12',
      value: '5719842337'
    },
    {
      id: 'CID_9341614254',
      name: 'Ads.com - RSOC - UTC - 13',
      value: '9341614254'
    },
    {
      id: 'CID_9790364217',
      name: 'Ads.com - UTC - 14',
      value: '9790364217'
    },
    {
      id: 'CID_2420687578',
      name: 'Ads.com - UTC - 16',
      value: '2420687578'
    },
    {
      id: 'CID_6324595978',
      name: 'Ads.com - RSOC - UTC - 17',
      value: '6324595978'
    },
    {
      id: 'CID_5133038944',
      name: 'Ads.com - RSOC - UTC - 18',
      value: '5133038944'
    },
    {
      id: 'CID_9084731648',
      name: 'Ads.com - RSOC - UTC - 19',
      value: '9084731648'
    },
    {
      id: 'CID_5109995931',
      name: 'Ads.com - RSOC - UTC - 20',
      value: '5109995931'
    },
    {
      id: 'CID_3218250684',
      name: 'Ads.com - UTC - 21',
      value: '3218250684'
    },
    {
      id: 'CID_7035336235',
      name: 'Ads.com - UTC - 22',
      value: '7035336235'
    },
    {
      id: 'CID_5343981146',
      name: 'Ads.com - UTC - 23',
      value: '5343981146'
    },
    {
      id: 'CID_1908857409',
      name: 'Ads.com - UTC - 24',
      value: '1908857409'
    },
    {
      id: 'CID_3848887282',
      name: 'Ads.com - UTC - 25',
      value: '3848887282'
    },
    {
      id: 'CID_4213092623',
      name: 'Ads.com - UTC - 26',
      value: '4213092623'
    },
    {
      id: 'CID_6626619603',
      name: 'Ads.com - RSOC - UTC - 27',
      value: '6626619603'
    },
    {
      id: 'CID_8914190629',
      name: 'Ads.com - RSOC - UTC - 28',
      value: '8914190629'
    },
    {
      id: 'CID_9876515601',
      name: 'Ads.com - RSOC - UTC - 29',
      value: '9876515601'
    },
    {
      id: 'CID_8600545272',
      name: 'Ads.com - UTC - 30',
      value: '8600545272'
    },
    {
      id: 'CID_3118222043',
      name: 'Ads.com - UTC - 31',
      value: '3118222043'
    },
    {
      id: 'CID_7824950746',
      name: 'Ads.com - UTC - 32',
      value: '7824950746'
    },
    {
      id: 'CID_5675630727',
      name: 'Ads.com - RSOC - UTC - 34',
      value: '5675630727'
    },
    {
      id: 'CID_3304906147',
      name: 'Ads.com - RSOC - UTC - 35',
      value: '3304906147'
    },
    {
      id: 'CID_8825176554',
      name: 'Ads.com - RSOC - UTC - 36',
      value: '8825176554'
    },
    {
      id: 'CID_8321499303',
      name: 'Ads.com - RSOC - UTC - 37',
      value: '8321499303'
    },
    {
      id: 'CID_7953604784',
      name: 'Ads.com - RSOC - UTC - 38',
      value: '7953604784'
    },
    {
      id: 'CID_9436130288',
      name: 'Ads.com - RSOC - UTC - 39',
      value: '9436130288'
    },
    {
      id: 'CID_7572891295',
      name: 'Ads.com - RSOC - UTC - 40',
      value: '7572891295'
    },
    {
      id: 'CID_8807720960',
      name: 'Ads.com - RSOC - UTC - Yahoo',
      value: '8807720960'
    },
    {
      id: 'CID_4277350349',
      name: 'RSOC - UTC - Ads.com',
      value: '4277350349'
    }
  ];

  const handlePeriodSelect = (period: string) => {
    // Only proceed if period is different or we're forcing a refresh
    if (selectedPeriod === period) {
      // Same period selected, force refresh
      const { start, end } = getDateRangeForPeriod(period);
      const startDate = start.format('YYYY-MM-DD');
      const endDate = end.format('YYYY-MM-DD');
      fetchData(startDate, endDate, selectedCustomerId);
      return;
    }
    
    setSelectedPeriod(period);
    const { start, end } = getDateRangeForPeriod(period);
    const startDate = start.format('YYYY-MM-DD');
    const endDate = end.format('YYYY-MM-DD');
    setDateRange([start, end]);
    fetchData(startDate, endDate, selectedCustomerId);
  };

  const handleRefresh = () => {
    const startDate = dateRange[0].format('YYYY-MM-DD');
    const endDate = dateRange[1].format('YYYY-MM-DD');
    
    // Clear any existing auto-refresh timer
    if (autoRefreshTimerRef.current) {
      clearTimeout(autoRefreshTimerRef.current);
      autoRefreshTimerRef.current = null;
    }
    
    console.log('Manual refresh triggered at', new Date().toLocaleTimeString());
    
    fetchData(startDate, endDate, selectedCustomerId);
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

  // Format the last updated time in a human-readable format
  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Unknown';
    
    const updateTime = dayjs(lastUpdated);
    const now = dayjs();
    
    // If it's within the last hour, show "X minutes ago"
    if (now.diff(updateTime, 'hour') < 1) {
      return updateTime.fromNow();
    }
    
    // Otherwise show the full date and time
    return updateTime.format('MMM D, YYYY h:mm A');
  };
  
  // Format the time until next update
  const formatNextUpdate = () => {
    if (nextUpdateIn === null) return 'Unknown';
    
    const minutes = Math.floor(nextUpdateIn / 60);
    const seconds = nextUpdateIn % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    
    return `${seconds}s`;
  };

  return (
    <App>
      <Layout className={styles.dashboardLayout}>
        <Header className={styles.dashboardHeader}>
          <div className={styles.headerContent}>
            <div className={styles.logoContainer}>
              <div className={styles.logoIcon}>
                <BarChartOutlined />
              </div>
              <div className={styles.logoText}>AdSyntheX</div>
            </div>
            
            <div className={styles.headerControls}>
              <div className={styles.datePickerWrapper}>
                <CalendarOutlined className={styles.datePickerIcon} />
                <RangePicker 
                  value={dateRange}
                  onChange={handleDateChange}
                  allowClear={false}
                  className={styles.dateRangePicker}
                />
              </div>
              <div className={styles.quickDateButtons}>
                <Button 
                  size="small"
                  onClick={selectToday}
                  className={styles.quickDateButton}
                >
                  Today
                </Button>
                <Button 
                  size="small"
                  onClick={selectYesterday}
                  className={styles.quickDateButton}
                >
                  Yesterday
                </Button>
                <Button 
                  size="small"
                  onClick={selectLast3Days} 
                  className={styles.quickDateButton}
                >
                  Last 3 Days
                </Button>
              </div>
              <Button 
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                loading={loading}
                className={styles.refreshButton}
              >
                Refresh Data
              </Button>
            </div>
          </div>
        </Header>
        
        <Content className={styles.dashboardContent}>
          <div className={styles.pageHeader}>
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
            
            {/* Data Update Status */}
            <div className={styles.dataUpdateStatus}>
              <div className={styles.updateInfo}>
                <Tooltip title="Last time Ads.com updated their data">
                  <Badge 
                    status={nextUpdateIn && nextUpdateIn < 60 ? "processing" : "success"} 
                    text={
                      <span>
                        <ClockCircleOutlined style={{ marginRight: 5 }} />
                        <strong>Last updated:</strong> {formatLastUpdated()}
                      </span>
                    } 
                  />
                </Tooltip>
              </div>
              
              {nextUpdateIn !== null && (
                <div className={styles.nextUpdateInfo}>
                  <Tooltip title="Time until Ads.com's next data update">
                    <Badge 
                      status={nextUpdateIn < 60 ? "processing" : "default"} 
                      text={
                        <span className={nextUpdateIn < 60 ? styles.updateImminent : ""}>
                          <SyncOutlined spin={nextUpdateIn < 60} style={{ marginRight: 5 }} />
                          <strong>Next update in:</strong> {formatNextUpdate()}
                        </span>
                      } 
                    />
                  </Tooltip>
                </div>
              )}
              
              <div className={styles.autoRefreshToggle}>
                <Tooltip title={autoRefresh ? "Auto-refresh enabled" : "Auto-refresh disabled"}>
                  <Switch 
                    size="small" 
                    checked={autoRefresh} 
                    onChange={toggleAutoRefresh} 
                    checkedChildren="Auto" 
                    unCheckedChildren="Manual" 
                  />
                </Tooltip>
                <span className={styles.autoRefreshLabel}>Auto-refresh</span>
                <Button 
                  size="small" 
                  type="text"
                  icon={<ReloadOutlined />} 
                  onClick={() => {
                    console.log('Manual refresh of Ads.com data requested');
                    message.loading({
                      content: 'Refreshing Ads.com data...',
                      key: 'adscomRefresh',
                      duration: 0
                    });
                    
                    // Make a targeted refresh of just the Ads.com data
                    const startDate = dateRange[0].format('YYYY-MM-DD');
                    const endDate = dateRange[1].format('YYYY-MM-DD');
                    
                    makeApiCall('/api/adscom', {
                      startDate,
                      endDate,
                      customerId: selectedCustomerId
                      // Removed forceRefresh to use MongoDB cache when available (<60 min old)
                    })
                    .then(adscomData => {
                      // Handle null data safely
                      const articleData = adscomData && adscomData.data ? adscomData.data : [];
                      
                      setRevenueData(articleData);
                      
                      // Store update time information
                      if (adscomData && adscomData.lastUpdated) {
                        setLastUpdated(adscomData.lastUpdated);
                        setNextUpdateIn(adscomData.nextUpdateIn || null);
                        
                        // Set up auto-refresh timer if enabled
                        if (autoRefresh && adscomData.nextUpdateIn && adscomData.nextUpdateIn > 0) {
                          scheduleNextRefresh(adscomData.nextUpdateIn);
                        }
                      }
                      
                      message.success({
                        content: 'Ads.com data refreshed',
                        key: 'adscomRefresh',
                        duration: 2
                      });
                    })
                    .catch(error => {
                      console.error('Error refreshing Ads.com data:', error);
                      message.error({
                        content: 'Failed to refresh Ads.com data',
                        key: 'adscomRefresh',
                        duration: 2
                      });
                    });
                  }}
                  className={styles.manualRefreshButton}
                  title="Manually refresh Ads.com data"
                />
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className={styles.loadingContainer}>
              <div className={styles.modernLoaderWrapper}>
                <div className={styles.modernLoader} aria-label="Loading indicator" role="status">
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                </div>
                <Title level={5} style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Loading…</Title>
              </div>
            </div>
          ) : (
            <>
              <NotesProvider>
                <SummaryCards 
                  revenueData={revenueData} 
                  costData={costData} 
                />
                <DataTable 
                  revenueData={revenueData}
                  costData={costData}
                />
              </NotesProvider>
            </>
          )}
        </Content>
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