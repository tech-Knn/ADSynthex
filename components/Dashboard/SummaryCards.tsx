import React from 'react';
import { Row, Col, Typography } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DollarOutlined, LineChartOutlined, EyeOutlined } from '@ant-design/icons';
import { AdsComArticleData } from '../../lib/adscom-api';
import { GoogleAdsAd } from '../../lib/google-ads-api';

const { Title, Text } = Typography;

interface SummaryCardsProps {
  revenueData: AdsComArticleData[];
  costData: GoogleAdsAd[];
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ revenueData, costData }) => {
  // Calculate total metrics
  const totalVisits = revenueData.reduce((sum, article) => sum + article.visits, 0);
  const totalClicks = revenueData.reduce((sum, article) => sum + article.clicks, 0);
  const totalRevenue = revenueData.reduce((sum, article) => sum + article.revenue, 0);
  const totalImpressions = costData.reduce((sum, ad) => sum + (ad.metrics?.impressions || 0), 0);
  const totalCostClicks = costData.reduce((sum, ad) => sum + (ad.metrics?.clicks || 0), 0);
  const totalCost = costData.reduce((sum, ad) => sum + (ad.metrics?.cost || 0), 0);
  const totalProfit = totalRevenue - totalCost;

  // Calculate ROI using correct formula: (Profit / Cost) * 100%
  let roi = 0;
  if (totalCost > 0) {
    roi = (totalProfit / totalCost) * 100;
  } else if (totalRevenue > 0) {
    roi = Infinity; // Infinite ROI when there is revenue but no cost
  }

  // Calculate averages
  const avgCTR = totalVisits > 0 ? (totalClicks / totalVisits) * 100 : 0;
  const avgRPM = totalVisits > 0 ? (totalRevenue / totalVisits) * 1000 : 0;
  
  // Display the actual count of articles rather than campaigns
  const articleCount = revenueData.length;
  
  // Safe number formatting helper
  const safeFormat = {
    number: (value: any): string => {
      return (typeof value === 'number' && !isNaN(value)) 
        ? value.toLocaleString() 
        : '0';
    },
    currency: (value: any): string => {
      return (typeof value === 'number' && !isNaN(value))
        ? value.toFixed(2)
        : '0.00';
    },
    percentage: (value: any): string => {
      return (typeof value === 'number' && !isNaN(value))
        ? value.toFixed(2) + '%'
        : '0.00%';
    }
  };

  return (
    <div className="summary-cards-container">
      <div className="summary-header">
        <Title level={4}>Dashboard Overview</Title>
      </div>
      
      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} md={12} lg={6}>
          <div className="tile tile-1">
            <div className="tile-content">
              <div className="tile-icon tile-icon-1">
                <DollarOutlined />
              </div>
              <div className="tile-info">
                <div className="tile-title">Total Revenue</div>
                <div className="tile-value text-primary">${safeFormat.currency(totalRevenue)}</div>
                <div className="tile-footer">
                  <span className="metric-label">Avg. RPM:</span>
                  <span className="metric-value text-primary">${safeFormat.currency(avgRPM)}</span>
                </div>
              </div>
            </div>
          </div>
        </Col>
        
        <Col xs={24} sm={12} md={12} lg={6}>
          <div className="tile tile-2">
            <div className="tile-content">
              <div className="tile-icon tile-icon-2">
                <DollarOutlined />
              </div>
              <div className="tile-info">
                <div className="tile-title">Total Cost</div>
                <div className="tile-value text-error">${safeFormat.currency(totalCost)}</div>
                <div className="tile-footer">
                  <span className="metric-label">Articles:</span>
                  <span className="metric-value text-error">{articleCount}</span>
                </div>
              </div>
            </div>
          </div>
        </Col>
        
        <Col xs={24} sm={12} md={12} lg={6}>
          <div className="tile tile-3">
            <div className="tile-content">
              <div className="tile-icon tile-icon-3">
                <LineChartOutlined />
              </div>
              <div className="tile-info">
                <div className="tile-title">Net Profit</div>
                <div className="tile-value text-success">
                  ${safeFormat.currency(totalProfit)}
                  {totalProfit > 0 ? (
                    <ArrowUpOutlined className="trend-icon profit-positive" />
                  ) : (
                    <ArrowDownOutlined className="trend-icon profit-negative" />
                  )}
                </div>
                <div className="tile-footer">
                  <span className="metric-label">ROI:</span>
                  <span className="metric-value text-success">{safeFormat.percentage(roi)}</span>
                </div>
              </div>
            </div>
          </div>
        </Col>
        
        <Col xs={24} sm={12} md={12} lg={6}>
          <div className="tile tile-4">
            <div className="tile-content">
              <div className="tile-icon tile-icon-4">
                <EyeOutlined />
              </div>
              <div className="tile-info">
                <div className="tile-title">Total Traffic</div>
                <div className="tile-value" style={{ color: 'var(--secondary-color)' }}>
                  {safeFormat.number(totalVisits)}
                </div>
                <div className="tile-footer">
                  <span className="metric-label">CTR:</span>
                  <span className="metric-value" style={{ color: 'var(--secondary-color)' }}>
                    {safeFormat.percentage(avgCTR)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      <style jsx global>{`
        .summary-cards-container {
          margin-bottom: 32px;
        }
        
        .summary-header {
          margin-bottom: 24px;
        }
        
        .summary-header h4 {
          margin-bottom: 4px;
          font-weight: 600;
        }
        
        .metric-label {
          color: var(--text-secondary);
          margin-right: 6px;
        }
        
        .metric-value {
          font-weight: 600;
        }
        
        .trend-icon {
          margin-left: 10px;
          font-size: 18px;
        }
        
        .profit-positive {
          color: var(--success-color);
        }
        
        .profit-negative {
          color: var(--error-color);
        }
        
        /* Animation delay for cards */
        .summary-cards-container .ant-col:nth-child(1) .tile {
          animation: slideUp 0.4s ease-out;
        }
        
        .summary-cards-container .ant-col:nth-child(2) .tile {
          animation: slideUp 0.4s ease-out 0.1s forwards;
          opacity: 0;
        }
        
        .summary-cards-container .ant-col:nth-child(3) .tile {
          animation: slideUp 0.4s ease-out 0.2s forwards;
          opacity: 0;
        }
        
        .summary-cards-container .ant-col:nth-child(4) .tile {
          animation: slideUp 0.4s ease-out 0.3s forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
};

export default SummaryCards; 