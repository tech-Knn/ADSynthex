import React, { useState, useEffect } from 'react';
import { Card, Progress, Alert, Tooltip, Button, Space } from 'antd';
import { InfoCircleOutlined, WarningOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';

interface QuotaStatus {
  dailyRequestCount: number;
  maxRequestsPerDay: number;
  remainingRequests: number;
  usagePercentage: number;
  lastRequestTime: string | null;
  resetTime: string;
}

interface QuotaResponse {
  quota: QuotaStatus;
  config: any;
  timestamp: string;
  recommendations: Array<{
    type: 'warning' | 'critical' | 'info';
    message: string;
    action: string;
  }>;
}

const QuotaStatus: React.FC = () => {
  const [quotaData, setQuotaData] = useState<QuotaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuotaStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/google-ads/quota', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch quota status: ${response.status}`);
      }
      
      const data = await response.json();
      setQuotaData(data);
    } catch (err) {
      console.error('Error fetching quota status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotaStatus();
  }, []);

  if (loading) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          Loading quota status...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <Alert
          message="Quota Status Error"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={fetchQuotaStatus} icon={<ReloadOutlined />}>
              Retry
            </Button>
          }
        />
      </Card>
    );
  }

  if (!quotaData) {
    return null;
  }

  const { quota, recommendations } = quotaData;
  const hasWarnings = recommendations.some(rec => rec.type === 'warning' || rec.type === 'critical');

  return (
    <Card 
      size="small" 
      style={{ marginBottom: 16 }}
      title={
        <Space>
          <span>Google Ads API Quota Status</span>
          <Tooltip title="Click to refresh quota status">
            <Button 
              type="text" 
              size="small" 
              icon={<ReloadOutlined />} 
              onClick={fetchQuotaStatus}
              loading={loading}
            />
          </Tooltip>
        </Space>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span>Daily Usage</span>
          <span>
            {quota.dailyRequestCount} / {quota.maxRequestsPerDay} requests
            <span style={{ marginLeft: 8, color: '#666' }}>
              ({quota.usagePercentage}%)
            </span>
          </span>
        </div>
        
        <Progress 
          percent={quota.usagePercentage} 
          status={quota.usagePercentage >= 90 ? 'exception' : quota.usagePercentage >= 75 ? 'active' : 'normal'}
          strokeColor={
            quota.usagePercentage >= 90 ? '#ff4d4f' : 
            quota.usagePercentage >= 75 ? '#faad14' : 
            '#52c41a'
          }
        />
        
        <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
          <div>Remaining: {quota.remainingRequests} requests</div>
          <div>Resets: {new Date(quota.resetTime).toLocaleString()}</div>
          {quota.lastRequestTime && (
            <div>Last request: {new Date(quota.lastRequestTime).toLocaleString()}</div>
          )}
        </div>
      </div>

      {hasWarnings && (
        <div style={{ marginTop: 16 }}>
          {recommendations.map((rec, index) => (
            <Alert
              key={index}
              message={rec.message}
              description={rec.action}
              type={rec.type === 'critical' ? 'error' : rec.type === 'warning' ? 'warning' : 'info'}
              showIcon
              icon={
                rec.type === 'critical' ? <ExclamationCircleOutlined /> :
                rec.type === 'warning' ? <WarningOutlined /> :
                <InfoCircleOutlined />
              }
              style={{ marginBottom: 8 }}
            />
          ))}
        </div>
      )}

      {quota.usagePercentage >= 90 && (
        <Alert
          message="High API Usage Detected"
          description="Your Google Ads API usage is high. Consider implementing caching or reducing request frequency to avoid hitting rate limits."
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
    </Card>
  );
};

export default QuotaStatus; 