'use client';

import React, { useState, useEffect } from 'react';
import { Card, Table, message, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

interface CampaignData {
  campaign_id: string;
  conversions: number;
  revenue: number;
  average_revenue: number;
}

interface CampaignPerformanceProps {
  startDate: string;
  endDate: string;
}

const CampaignPerformance: React.FC<CampaignPerformanceProps> = ({ startDate, endDate }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);

  const fetchCampaignPerformance = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/compado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          action: 'campaigns'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch campaign performance');
      }

      const data = await response.json();
      setCampaigns(data);
    } catch (error: any) {
      console.error('Error fetching campaign performance:', error);
      message.error(error.message || 'Failed to load campaign data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaignPerformance();
  }, [startDate, endDate]);

  const columns: ColumnsType<CampaignData> = [
    {
      title: 'Campaign ID',
      dataIndex: 'campaign_id',
      key: 'campaign_id',
      fixed: 'left',
      width: 200,
      render: (text: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
          {text}
        </span>
      )
    },
    {
      title: 'Conversions',
      dataIndex: 'conversions',
      key: 'conversions',
      align: 'right',
      sorter: (a, b) => a.conversions - b.conversions,
      render: (value: number) => (
        <Tag color="green" style={{ fontSize: '13px', fontWeight: 500 }}>
          {value.toLocaleString()}
        </Tag>
      )
    },
    {
      title: 'Revenue',
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      sorter: (a, b) => a.revenue - b.revenue,
      render: (value: number) => (
        <span style={{ fontWeight: 600, color: '#1890ff', fontSize: '14px' }}>
          ${value.toFixed(2)}
        </span>
      )
    },
    {
      title: 'Avg Revenue',
      dataIndex: 'average_revenue',
      key: 'average_revenue',
      align: 'right',
      sorter: (a, b) => a.average_revenue - b.average_revenue,
      render: (value: number) => (
        <span style={{ color: '#722ed1', fontSize: '13px' }}>
          ${value.toFixed(4)}
        </span>
      )
    },
    {
      title: 'Performance',
      key: 'performance',
      align: 'center',
      render: (_: any, record: CampaignData) => {
        const performance = record.revenue;
        let color = '#52c41a';
        let label = 'Good';

        if (performance < 1) {
          color = '#faad14';
          label = 'Low';
        } else if (performance >= 10) {
          color = '#1890ff';
          label = 'Excellent';
        }

        return <Tag color={color}>{label}</Tag>;
      }
    }
  ];

  return (
    <Card
      title="Campaign Performance"
      style={{
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}
      bodyStyle={{ padding: '0' }}
    >
      <Table
        columns={columns}
        dataSource={campaigns}
        loading={loading}
        rowKey="campaign_id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `Total ${total} campaigns`,
          pageSizeOptions: ['10', '20', '50', '100']
        }}
        scroll={{ x: 800 }}
        size="middle"
      />
    </Card>
  );
};

export default CampaignPerformance;
