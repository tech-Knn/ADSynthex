'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, Select, DatePicker, Spin, Alert, Typography, Descriptions, Table, Space } from 'antd';
import { ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import DashboardLayout from '@/components/Layout/DashboardLayout';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

interface RevenueData {
  date: string;
  style_id: string;
  country_name: string;
  domain_name: string;
  earnings: number;
  impressions: number;
  clicks: number;
}

export default function AdSenseTestPage() {
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [adsenseAccounts, setAdsenseAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(7, 'days'),
    dayjs()
  ]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdSenseAccounts();
  }, []);

  const fetchAdSenseAccounts = async () => {
    try {
      setLoadingAccounts(true);
      setError(null);
      const response = await fetch('/api/adsense-accounts');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to fetch AdSense accounts');
      }

      console.log('AdSense accounts:', data.accounts);
      setAdsenseAccounts(data.accounts || []);

      if (data.accounts && data.accounts.length > 0) {
        setSelectedAccount(data.accounts[0].name);
      } else {
        setError('No AdSense accounts found. Please check your AdSense API configuration.');
      }
    } catch (err: any) {
      console.error('Error fetching accounts:', err);
      setError(`Failed to fetch AdSense accounts: ${err.message}`);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchRevenueData = async () => {
    if (!selectedAccount) {
      setError('Please select an AdSense account');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');

      console.log('Fetching revenue data...');
      console.log('Account:', selectedAccount);
      console.log('Date Range:', startDate, 'to', endDate);

      const response = await fetch('/api/adsense-test-revenue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          adsenseAccountId: selectedAccount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to fetch revenue data');
      }

      console.log('Revenue data received:', data);
      setResult(data);

    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 120,
    },
    {
      title: 'Style ID',
      dataIndex: 'style_id',
      key: 'style_id',
      width: 150,
    },
    {
      title: 'Country',
      dataIndex: 'country_name',
      key: 'country_name',
      width: 120,
    },
    {
      title: 'Domain',
      dataIndex: 'domain_name',
      key: 'domain_name',
      width: 200,
    },
    {
      title: 'Earnings',
      dataIndex: 'earnings',
      key: 'earnings',
      width: 120,
      render: (value: number) => `$${value.toFixed(2)}`,
    },
    {
      title: 'Impressions',
      dataIndex: 'impressions',
      key: 'impressions',
      width: 120,
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: 'Clicks',
      dataIndex: 'clicks',
      key: 'clicks',
      width: 100,
      render: (value: number) => value.toLocaleString(),
    },
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: '24px' }}>
        <Title level={2}>AdSense Revenue Data Test</Title>
        <Text type="secondary">
          Test endpoint to fetch and display AdSense revenue data
        </Text>

        <Card style={{ marginTop: 24 }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Account Selection */}
            <div>
              <Text strong>AdSense Account:</Text>
              {adsenseAccounts.length === 0 && !loadingAccounts ? (
                <Alert
                  style={{ marginTop: 8 }}
                  message="No AdSense Accounts Found"
                  description="Please check your AdSense API configuration and ensure accounts exist."
                  type="warning"
                  showIcon
                />
              ) : (
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  value={selectedAccount}
                  onChange={setSelectedAccount}
                  loading={loadingAccounts}
                  placeholder={loadingAccounts ? "Loading accounts..." : "Select AdSense account"}
                  disabled={adsenseAccounts.length === 0}
                >
                  {adsenseAccounts.map((account) => (
                    <Option key={account.name} value={account.name}>
                      {account.displayName} ({account.name})
                    </Option>
                  ))}
                </Select>
              )}
            </div>

            {/* Date Range */}
            <div>
              <Text strong>Date Range:</Text>
              <RangePicker
                style={{ width: '100%', marginTop: 8 }}
                value={dateRange}
                onChange={(dates) => dates && setDateRange(dates as [Dayjs, Dayjs])}
                format="YYYY-MM-DD"
              />
            </div>

            {/* Fetch Button */}
            <Button
              type="primary"
              size="large"
              icon={<ReloadOutlined />}
              onClick={fetchRevenueData}
              loading={loading}
              disabled={!selectedAccount || loading}
              block
            >
              {loading ? 'Fetching Revenue Data...' : 'Fetch Revenue Data'}
            </Button>
          </Space>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert
            style={{ marginTop: 24 }}
            message="Error"
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {/* Results */}
        {result && (
          <>
            {/* Summary Card */}
            <Card
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <span>Revenue Data Retrieved Successfully</span>
                </Space>
              }
              style={{ marginTop: 24 }}
            >
              <Descriptions bordered column={2}>
                <Descriptions.Item label="Account">
                  {result.account}
                </Descriptions.Item>
                <Descriptions.Item label="Date Range">
                  {result.dateRange.startDate} to {result.dateRange.endDate}
                </Descriptions.Item>
                <Descriptions.Item label="Total Rows">
                  {result.summary.totalRows.toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Parsed Rows">
                  {result.summary.parsedRows.toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Unique Style IDs">
                  {result.summary.uniqueStyleIds.toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Unique Domains">
                  {result.summary.uniqueDomains.toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Total Earnings" span={2}>
                  <Text strong style={{ fontSize: 18, color: '#52c41a' }}>
                    ${result.summary.totalEarnings.toFixed(2)}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Total Impressions">
                  {result.summary.totalImpressions.toLocaleString()}
                </Descriptions.Item>
                <Descriptions.Item label="Total Clicks">
                  {result.summary.totalClicks.toLocaleString()}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* Sample Data Table */}
            {result.sampleData && result.sampleData.length > 0 && (
              <Card
                title="Sample Data (First 10 Rows)"
                style={{ marginTop: 24 }}
              >
                <Table
                  dataSource={result.sampleData}
                  columns={columns}
                  rowKey={(record: RevenueData, index) => `${record.date}_${record.style_id}_${index}`}
                  pagination={false}
                  scroll={{ x: 1000 }}
                  size="small"
                />
              </Card>
            )}

            {/* All Revenue Data Table */}
            {result.allRevenues && result.allRevenues.length > 0 && (
              <Card
                title={`All Revenue Data (${result.allRevenues.length} rows)`}
                style={{ marginTop: 24 }}
              >
                <Table
                  dataSource={result.allRevenues}
                  columns={columns}
                  rowKey={(record: RevenueData, index) => `${record.date}_${record.style_id}_${record.country_name}_${index}`}
                  pagination={{
                    pageSize: 50,
                    showSizeChanger: true,
                    showTotal: (total) => `Total ${total} records`,
                  }}
                  scroll={{ x: 1000 }}
                  size="small"
                />
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
