'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Typography, DatePicker, Button, Row, Col, Alert, Spin, Select, Input, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import DashboardLayout from '@/components/Layout/DashboardLayout';

const { Content } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

interface AdSenseCostRevenueResponse {
  google_ads_data: any;
  adsense_data: any;
  cost_revenue_mapping: any[];
  campaign_aggregated: any[];
  account_level_aggregated: any[];
  summary: any;
  _source: string;
  _timestamp: string;
  _message: string;
}

interface AdSenseAccount {
  name: string;
  displayName: string;
  state: string;
}

export default function AdSensePage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AdSenseCostRevenueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleAdsAccounts, setGoogleAdsAccounts] = useState<any[]>([]);
  const [adsenseAccounts, setAdsenseAccounts] = useState<AdSenseAccount[]>([]);
  const [selectedGoogleAdsAccount, setSelectedGoogleAdsAccount] = useState<string | null>(null);
  const [selectedAdsenseAccount, setSelectedAdsenseAccount] = useState<string>('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs()]);

  // Domain filter - default to termuxtools.com
  const [filterDomain, setFilterDomain] = useState<string>('termuxtools.com');

  // Metric filters
  const [searchStyleId, setSearchStyleId] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('revenue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  useEffect(() => {
    fetchGoogleAdsAccounts();
    fetchAdsenseAccounts();
  }, []);

  // Auto-select termuxtools.com when data loads
  useEffect(() => {
    if (data?.campaign_aggregated) {
      const domains = new Set(
        data.campaign_aggregated
          .map((c: any) => c.domain)
          .filter((d: string) => d && d !== 'N/A')
      );

      if (domains.has('termuxtools.com')) {
        setFilterDomain('termuxtools.com');
      } else if (domains.size > 0) {
        setFilterDomain(Array.from(domains)[0] as string);
      }
    }
  }, [data]);

  // Auto-fetch data when accounts are loaded
  useEffect(() => {
    if (!loadingAccounts && selectedGoogleAdsAccount && selectedAdsenseAccount && !data && !loading) {
      console.log('[AFS] Auto-fetching data on page load');
      fetchData();
    }
  }, [loadingAccounts, selectedGoogleAdsAccount, selectedAdsenseAccount]);

  const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith(name + '='));
    return cookieValue ? cookieValue.split('=')[1] : null;
  };

  const fetchGoogleAdsAccounts = async () => {
    try {
      const authType = getCookie('auth_type');
      const userAccountId = getCookie('account_id');
      setIsAdmin(authType === 'admin');

      const { ACCOUNT_FEED_ACCESS } = await import('@/lib/account-access-control');

      const response = await fetch('/api/google-ads/accounts');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch Google Ads accounts');
      }

      // Log if using cached data
      if (result._cached) {
        console.log(`[AFS] Using cached accounts (age: ${result._cacheAge})`);
      }

      const allAccounts = result.accounts?.managed || result.accounts?.all || [];

      const adsenseAccounts = allAccounts.filter((acc: any) => {
        // Filter out Oarex Funding LLC
        if (acc.name && acc.name.includes('Oarex Funding LLC')) {
          return false;
        }

        const accountKey = `CID_${acc.id}`;
        const feeds = ACCOUNT_FEED_ACCESS[accountKey];
        return feeds && feeds.includes('adsense');
      });

      console.log('[AFS] Filtered AFS accounts:', adsenseAccounts.length);

      const sortedAccounts = adsenseAccounts.sort((a: any, b: any) => {

        const getSequenceNumber = (name: string): number => {
          const istMatch = name.match(/IST\s*-\s*(\d+)/i);
          if (istMatch) return parseInt(istMatch[1]);

          const afsMatch = name.match(/AFS\s*-?\s*(\d+)/i);
          if (afsMatch) return parseInt(afsMatch[1]);

          // Fallback: extract last number
          const lastMatch = name.match(/(\d+)$/);
          return lastMatch ? parseInt(lastMatch[1]) : 9999;
        };
        return getSequenceNumber(a.name) - getSequenceNumber(b.name);
      });

      sortedAccounts.forEach((acc: { id: any; name: any; }) => {
        console.log(`[AFS]   - ${acc.id}: ${acc.name}`);
      });

      if (authType === 'admin') {
        setGoogleAdsAccounts(sortedAccounts);
        // Set default to "all" for admin users
        if (adsenseAccounts.length > 0) {
          setSelectedGoogleAdsAccount('all');
        }
      } else if (userAccountId) {
        const userAccount = adsenseAccounts.find((acc: any) => `CID_${acc.id}` === userAccountId);
        if (userAccount) {
          setGoogleAdsAccounts([userAccount]);
          setSelectedGoogleAdsAccount(userAccount.id);
        } else {
          setError('Your account does not have access to AFS feed');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchAdsenseAccounts = async () => {
    try {
      const response = await fetch('/api/adsense-accounts');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch AdSense accounts');
      }

      setAdsenseAccounts(result.accounts || []);
      if (result.accounts && result.accounts.length > 0) {
        setSelectedAdsenseAccount(result.accounts[0].name);
      }
    } catch (err: any) {
      console.error('Failed to fetch AdSense accounts:', err);
    }
  };

  const fetchData = async (forceLive = false) => {
    if (!selectedGoogleAdsAccount || !selectedAdsenseAccount) {
      console.warn('[AFS] Missing required fields:', { selectedGoogleAdsAccount, selectedAdsenseAccount });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [startDate, endDate] = dateRange;

      // If "all" is selected, send all account IDs
      let requestBody: any = {
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD'),
        adsenseAccountId: selectedAdsenseAccount,
        forceLive, // Add forceLive parameter to bypass cache
      };

      if (selectedGoogleAdsAccount === 'all') {
        // Send all account IDs
        const accountIds = googleAdsAccounts.map(acc => acc.id);
        requestBody.accountIds = accountIds;
        console.log('[AFS] Fetching data for ALL accounts:', accountIds);
      } else {
        // Send single account ID
        requestBody.customerId = selectedGoogleAdsAccount;
        console.log('[AFS] Fetching data for single account:', selectedGoogleAdsAccount);
      }

      if (forceLive) {
        console.log('[AFS] FORCE REFRESH - Bypassing cache!');
      }
      console.log('[AFS] Fetching data with params:', requestBody);

      const response = await fetch('/api/adsense-cost-revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();
      console.log('[AFS] API Response:', result);

      if (!response.ok) {
        console.error('[AFS] API Error:', result);
        throw new Error(result.error || result.message || 'Failed to fetch data');
      }

      setData(result);
      //filter on termuxtools.com
      console.log('[AFS] Data set successfully');
    } catch (err: any) {
      console.error('[AFS] Fetch error:', err);
      setError(err.message || 'Failed to fetch AFS data');
    } finally {
      setLoading(false);
    }
  };

  // Helper to format article name for display
  const formatArticleTitle = (slug: string): string => {
    if (!slug || slug === 'N/A') return 'N/A';

    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Helper to truncate article name to first 4 words
  const truncateArticleTitle = (title: string): string => {
    if (!title || title === 'N/A') return 'N/A';
    const words = title.split(' ');
    if (words.length <= 4) return title;
    return words.slice(0, 4).join(' ') + '...';
  };

  // Filter campaigns by domain (only termuxtools.com) with search and sorting
  const getFilteredCampaigns = () => {
    if (!data?.campaign_aggregated) return [];

    let filtered = data.campaign_aggregated.filter((campaign: any) => campaign.domain === filterDomain);

    // Apply style ID search filter
    if (searchStyleId) {
      filtered = filtered.filter((campaign: any) =>
        campaign.style_id?.toLowerCase().includes(searchStyleId.toLowerCase()) ||
        campaign.campaign_name?.toLowerCase().includes(searchStyleId.toLowerCase()) ||
        campaign.name?.toLowerCase().includes(searchStyleId.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a: any, b: any) => {
      let aValue = a[sortBy] || 0;
      let bValue = b[sortBy] || 0;

      if (sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    return filtered;
  };

  // Get paginated campaigns
  const getPaginatedCampaigns = () => {
    const filtered = getFilteredCampaigns();
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filtered.slice(startIndex, endIndex);
  };

  // Get total pages
  const getTotalPages = () => {
    const filtered = getFilteredCampaigns();
    return Math.ceil(filtered.length / pageSize);
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchStyleId, sortBy, sortOrder, pageSize]);

  // Calculate filtered summary
  const getFilteredSummary = () => {
    const filteredCampaigns = getFilteredCampaigns();

    return {
      totalCost: filteredCampaigns.reduce((sum: number, c: any) => sum + (c.cost || 0), 0),
      totalRevenue: filteredCampaigns.reduce((sum: number, c: any) => sum + (c.revenue || 0), 0),
      totalProfit: filteredCampaigns.reduce((sum: number, c: any) => sum + (c.profit || 0), 0),
      overallROI: data?.summary?.overallROI || 0
    };
  };

  return (
    <DashboardLayout>
      <Content style={{ padding: '24px', background: '#f0f2f5' }}>
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col span={24}>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
                <Title level={3}>
                  <SearchOutlined /> AdSense for Search (AFS) - TermuxTools
                </Title>
                <Text type="secondary" style={{ display: 'block' }}>
                  {/* Cost and Revenue tracking for termuxtools.com */}
                </Text>
              </div>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} md={8}>
              <div>
                <Text strong>Google Ads Account</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder="Select Google Ads Account"
                  value={selectedGoogleAdsAccount}
                  onChange={setSelectedGoogleAdsAccount}
                  disabled={!isAdmin || loadingAccounts}
                  loading={loadingAccounts}
                >
                  {isAdmin && googleAdsAccounts.length > 1 && (
                    <Option value="all">All Accounts ({googleAdsAccounts.length})</Option>
                  )}
                  {googleAdsAccounts.map(account => (
                    <Option key={account.id} value={account.id}>
                      {account.name}
                    </Option>
                  ))}
                </Select>
              </div>
            </Col>

            <Col xs={24} md={8}>
              <div>
                <Text strong>AdSense Account</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  placeholder="Select AdSense Account"
                  value={selectedAdsenseAccount}
                  onChange={setSelectedAdsenseAccount}
                  loading={loadingAccounts}
                >
                  {adsenseAccounts.map(account => (
                    <Option key={account.name} value={account.name}>
                      {account.displayName}
                    </Option>
                  ))}
                </Select>
              </div>
            </Col>

            <Col xs={24} md={8}>
              <div>
                <Text strong>Date Range</Text>
                <RangePicker
                  style={{ width: '100%', marginTop: 8 }}
                  value={dateRange}
                  onChange={(dates) => dates && setDateRange(dates as [Dayjs, Dayjs])}
                  format="YYYY-MM-DD"
                />
              </div>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col span={24}>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={() => fetchData(false)}
                loading={loading}
                disabled={!selectedGoogleAdsAccount || !selectedAdsenseAccount}
                style={{ marginRight: 8 }}
              >
                Fetch Data
              </Button>
              <Button
                type="default"
                icon={<ReloadOutlined />}
                onClick={() => fetchData(true)}
                loading={loading}
                disabled={!selectedGoogleAdsAccount || !selectedAdsenseAccount}
                danger
              >
                Force Refresh (Bypass Cache)
              </Button>
            </Col>
          </Row>

          {error && !data && (
            <Alert message="Error" description={error} type="error" showIcon style={{ marginBottom: 24 }} />
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '50px' }}>
              <Spin size="large" />
              <p style={{ marginTop: 16 }}>Loading AFS data...</p>
            </div>
          )}

          {data && !loading && (() => {
            const filteredSummary = getFilteredSummary();
            const filteredCampaigns = getFilteredCampaigns();
            const paginatedCampaigns = getPaginatedCampaigns();
            const totalPages = getTotalPages();

            return (
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <div style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
                    <Title level={4}>
                      {/* Summary - {getAccountName()} - termuxtools.com */}
                    </Title>
                    <Row gutter={[16, 16]}>
                      <Col xs={12} md={6}>
                        <div>
                          <Text type="secondary">Total Cost</Text>
                          <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                            ${filteredSummary.totalCost?.toFixed(2) || '0.00'}
                          </div>
                        </div>
                      </Col>
                      <Col xs={12} md={6}>
                        <div>
                          <Text type="secondary">Total Revenue</Text>
                          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                            ${filteredSummary.totalRevenue?.toFixed(2) || '0.00'}
                          </div>
                        </div>
                      </Col>
                      <Col xs={12} md={6}>
                        <div>
                          <Text type="secondary">Total Profit</Text>
                          <div style={{ fontSize: 24, fontWeight: 'bold', color: filteredSummary.totalProfit >= 0 ? '#52c41a' : '#f5222d' }}>
                            ${filteredSummary.totalProfit?.toFixed(2) || '0.00'}
                          </div>
                        </div>
                      </Col>
                      <Col xs={12} md={6}>
                        <div>
                          <Text type="secondary">ROI</Text>
                          <div style={{ fontSize: 24, fontWeight: 'bold' }}>
                            {((filteredSummary.totalCost > 0 ? (filteredSummary.totalProfit / filteredSummary.totalCost) * 100 : 0) || 0).toFixed(2)}%
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </div>
                </Col>

                <Col span={24}>
                  <div style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
                    <Title level={4}>
                      {/* Article Performance - {getAccountName()} - termuxtools.com */}
                    </Title>

                    {/* Metric Filters */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                      <Col xs={24} md={8}>
                        <Text strong>Search Campaign or Style ID</Text>
                        <Input
                          placeholder="Search by Campaign Name or Style ID"
                          value={searchStyleId}
                          onChange={(e) => setSearchStyleId(e.target.value)}
                          prefix={<SearchOutlined />}
                          allowClear
                          style={{ marginTop: 8 }}
                        />
                      </Col>
                      <Col xs={24} md={8}>
                        <Text strong>Sort By</Text>
                        <Select
                          style={{ width: '100%', marginTop: 8 }}
                          value={sortBy}
                          onChange={setSortBy}
                        >
                          <Option value="revenue">Revenue</Option>
                          <Option value="cost">Cost</Option>
                          <Option value="profit">Profit</Option>
                          <Option value="roi">ROI</Option>
                          <Option value="clicks">Revenue Clicks</Option>
                          <Option value="rpc">RPC</Option>
                          <Option value="cpa">CPA</Option>
                          <Option value="conversions">Conversions</Option>
                        </Select>
                      </Col>
                      <Col xs={24} md={8}>
                        <Text strong>Sort Order</Text>
                        <Select
                          style={{ width: '100%', marginTop: 8 }}
                          value={sortOrder}
                          onChange={setSortOrder}
                        >
                          <Option value="desc">Highest First</Option>
                          <Option value="asc">Lowest First</Option>
                        </Select>
                      </Col>
                    </Row>

                    {filteredCampaigns.length === 0 ? (
                      <Alert
                        message="No Data"
                        description="No data found for termuxtools.com"
                        type="info"
                        showIcon
                      />
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <style dangerouslySetInnerHTML={{
                          __html: `
                        .afs-performance-table {
                          width: 100%;
                          border-collapse: collapse;
                          font-size: 14px;
                        }

                        .afs-performance-table thead tr:first-child th {
                          padding: 12px;
                          font-weight: 800;
                          font-size: 14px;
                          border: 3px solid #ffffff;
                        }

                        .afs-performance-table thead tr:nth-child(2) th {
                          padding: 8px;
                          font-weight: 600;
                          font-size: 12px;
                          background: #fafafa;
                          border: 1px solid #f0f0f0;
                        }

                        .afs-performance-table tbody tr {
                          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        }

                        .afs-performance-table tbody tr:hover {
                          background: #f5f7ff !important;
                          transform: translateY(-4px) scale(1.01);
                          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
                          z-index: 2;
                        }

                        .afs-performance-table tbody td {
                          padding: 12px;
                          border-bottom: 1px solid #f0f0f0;
                        }

                        .afs-article-cell {
                          max-width: 250px;
                          overflow: hidden;
                          text-overflow: ellipsis;
                          white-space: nowrap;
                          font-weight: 500;
                          color: #1f2937;
                          cursor: pointer;
                          position: relative;
                        }

                        .afs-article-cell:hover {
                          color: #4f46e5;
                          font-weight: 600;
                        }
                      `}} />
                        <table className="afs-performance-table">
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', width: '20%', background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', color: '#1e293b', padding: '12px', borderRadius: '8px', fontWeight: '600' }}>Campaign Name</th>
                              <th colSpan={3} style={{ textAlign: 'center', background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', color: '#1e40af', padding: '12px', borderRadius: '8px', fontWeight: '600' }}>Google Ads Metrics</th>
                              <th colSpan={3} style={{ textAlign: 'center', background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', color: '#065f46', padding: '12px', borderRadius: '8px', fontWeight: '600' }}>AdSense Metrics</th>
                              <th colSpan={2} style={{ textAlign: 'center', background: 'linear-gradient(135deg, #e9d5ff, #d8b4fe)', color: '#6b21a8', padding: '12px', borderRadius: '8px', fontWeight: '600' }}>Performance</th>
                            </tr>
                            <tr style={{ background: '#fafafa' }}>
                              <th style={{ textAlign: 'left' }}></th>
                              <th style={{ textAlign: 'right', fontSize: '12px' }}>Cost</th>
                              <th style={{ textAlign: 'right', fontSize: '12px' }}>CPA</th>
                              <th style={{ textAlign: 'right', fontSize: '12px' }}>Conversions</th>
                              <th style={{ textAlign: 'right', fontSize: '12px' }}>Revenue</th>
                              <th style={{ textAlign: 'right', fontSize: '12px' }}>Clicks</th>
                              <th style={{ textAlign: 'right', fontSize: '12px' }}>RPC</th>
                              <th style={{ textAlign: 'right', fontSize: '12px' }}>Profit</th>
                              <th style={{ textAlign: 'right', fontSize: '12px' }}>ROI</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedCampaigns.map((campaign: any, idx: number) => (
                              <tr key={idx}>
                                <td className="afs-article-cell">
                                  <Tooltip title={campaign.campaign_name || campaign.name || 'N/A'} placement="topLeft">
                                    <div>
                                      {campaign.campaign_name || campaign.name || 'N/A'}
                                    </div>
                                  </Tooltip>
                                </td>
                                <td style={{ textAlign: 'right', color: '#ff4d4f', fontWeight: '500' }}>
                                  ${campaign.cost?.toFixed(2) || '0.00'}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  ${campaign.cpa?.toFixed(2) || '0.00'}
                                </td>
                                <td style={{ textAlign: 'right', color: '#722ed1', fontWeight: '500' }}>
                                  {campaign.conversions?.toFixed(0) || '0'}
                                </td>
                                <td style={{ textAlign: 'right', color: '#52c41a', fontWeight: '600' }}>
                                  ${campaign.revenue?.toFixed(2) || '0.00'}
                                </td>
                                <td style={{ textAlign: 'right', color: '#1890ff', fontWeight: '500' }}>
                                  {campaign.clicks?.toLocaleString() || '0'}
                                </td>
                                <td style={{ textAlign: 'right', color: '#fa8c16', fontWeight: '500' }}>
                                  ${campaign.rpc?.toFixed(4) || '0.0000'}
                                </td>
                                <td style={{ textAlign: 'right', color: campaign.profit >= 0 ? '#52c41a' : '#f5222d', fontWeight: '600' }}>
                                  ${campaign.profit?.toFixed(2) || '0.00'}
                                </td>
                                <td style={{ textAlign: 'right', color: campaign.roi >= 0 ? '#52c41a' : '#f5222d', fontWeight: '600' }}>
                                  {campaign.roi?.toFixed(2) || '0.00'}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Pagination Controls */}
                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <Text type="secondary">
                              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredCampaigns.length)} of {filteredCampaigns.length} entries
                            </Text>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Text type="secondary">Rows per page:</Text>
                            <Select
                              value={pageSize}
                              onChange={(value) => setPageSize(value)}
                              style={{ width: 80 }}
                            >
                              <Option value={10}>10</Option>
                              <Option value={20}>20</Option>
                              <Option value={50}>50</Option>
                              <Option value={100}>100</Option>
                            </Select>
                            <Button
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={currentPage === 1}
                            >
                              Previous
                            </Button>
                            <Text>
                              Page {currentPage} of {totalPages}
                            </Text>
                            <Button
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={currentPage === totalPages}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Col>
              </Row>
            );
          })()}
        </div>
      </Content>
    </DashboardLayout>
  );
}
