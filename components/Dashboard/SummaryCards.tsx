import React from 'react';
import { Row, Col, Typography, Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DollarOutlined, LineChartOutlined, EyeOutlined, WarningOutlined } from '@ant-design/icons';
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
        <Title level={4} className="dashboard-title">Dashboard Overview</Title>
      </div>
      
      <Row gutter={[16, 16]} justify="space-between" align="stretch">
        <Col xs={12} sm={12} md={8} lg={6} xl={4}>
          <div className="tile tile-1">
            <div className="tile-content">
              <div className="tile-icon tile-icon-1">
                <DollarOutlined />
              </div>
              <div className="tile-info">
                <div className="tile-title">TOTAL REVENUE</div>
                <div className="tile-value text-primary">${safeFormat.currency(totalRevenue)}</div>
                <div className="tile-footer">
                  <span className="metric-label">Avg. RPM:</span>
                  <span className="metric-value text-primary">${safeFormat.currency(avgRPM)}</span>
                </div>
              </div>
            </div>
          </div>
        </Col>
        
        <Col xs={12} sm={12} md={8} lg={6} xl={4}>
          <div className="tile tile-2">
            <div className="tile-content">
              <div className="tile-icon tile-icon-2">
                <DollarOutlined />
              </div>
              <div className="tile-info">
                <div className="tile-title">TOTAL COST</div>
                <div className="tile-value text-error">${safeFormat.currency(totalCost)}</div>
                <div className="tile-footer">
                  <span className="metric-label">Articles:</span>
                  <span className="metric-value text-error">{articleCount}</span>
                </div>
              </div>
            </div>
          </div>
        </Col>
        
        <Col xs={12} sm={12} md={8} lg={6} xl={4}>
          <div className="tile tile-3">
            <div className="tile-content">
              <div className="tile-icon tile-icon-3">
                <LineChartOutlined />
              </div>
              <div className="tile-info">
                <div className="tile-title">NET PROFIT</div>
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
        
        <Col xs={12} sm={12} md={8} lg={6} xl={4}>
          <div className="tile tile-4">
            <div className="tile-content">
              <div className="tile-icon tile-icon-4">
                <EyeOutlined />
              </div>
              <div className="tile-info">
                <div className="tile-title">TOTAL TRAFFIC</div>
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
          margin-bottom: 24px;
        }
        
        /* Tooltip styling */
        .ant-tooltip {
          max-width: 300px;
        }
        
        .ant-tooltip-inner {
          padding: 8px 12px;
          font-size: 14px;
          line-height: 1.5;
          border-radius: 4px;
          box-shadow: 0 3px 6px -4px rgba(0,0,0,0.12), 0 6px 16px 0 rgba(0,0,0,0.08);
        }
        
        .summary-header {
          margin-bottom: 16px;
        }
        
        .summary-header h4.dashboard-title {
          margin-bottom: 4px;
          font-weight: 600;
          font-size: 18px;
          color: #374151;
          padding-bottom: 8px;
          border-bottom: none;
        }
        
        .tile {
          background: linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          border: 1px solid rgba(0,0,0,0.05);
          padding: 16px;
          height: 100%;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
        }
        
        .tile:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,0.12);
          transform: translateY(-2px);
        }
        
        .tile-content {
          display: flex;
          align-items: flex-start;
          flex: 1;
        }
        
        .tile-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
          color: white;
          font-size: 16px;
          flex-shrink: 0;
        }
        
        .tile-icon-1 {
          background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
        }
        
        .tile-icon-2 {
          background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
        }
        
        .tile-icon-3 {
          background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
        }
        
        .tile-icon-4 {
          background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
        }
        
        .tile-icon-5 {
          background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
        }
        
        .tile-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        
        .tile-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 4px;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }
        
        .tile-value {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }
        
        .text-primary {
          color: var(--primary-color);
        }
        
        .text-success {
          color: var(--success-color);
        }
        
        .text-error {
          color: var(--error-color);
        }
        
        .tile-footer {
          display: flex;
          align-items: center;
          font-size: 12px;
          margin-top: auto;
        }
        
        .metric-label {
          color: var(--text-secondary);
          margin-right: 4px;
          white-space: nowrap;
        }
        
        .metric-value {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .trend-icon {
          margin-left: 6px;
          font-size: 14px;
        }
        
        .profit-positive {
          color: var(--success-color);
        }
        
        .profit-negative {
          color: var(--error-color);
        }
        
        /* Animation delay for cards */
        .summary-cards-container .ant-col:nth-child(1) .tile {
          animation: slideUp 0.3s ease-out;
        }
        
        .summary-cards-container .ant-col:nth-child(2) .tile {
          animation: slideUp 0.3s ease-out 0.05s forwards;
          opacity: 0;
        }
        
        .summary-cards-container .ant-col:nth-child(3) .tile {
          animation: slideUp 0.3s ease-out 0.1s forwards;
          opacity: 0;
        }
        
        .summary-cards-container .ant-col:nth-child(4) .tile {
          animation: slideUp 0.3s ease-out 0.15s forwards;
          opacity: 0;
        }
        
        .summary-cards-container .ant-col:nth-child(5) .tile {
          animation: slideUp 0.3s ease-out 0.2s forwards;
          opacity: 0;
        }
        
        @keyframes slideUp {
          0% {
            transform: translateY(10px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        @media (max-width: 576px) {
          .tile-value {
            font-size: 18px;
          }
          
          .tile-icon {
            width: 32px;
            height: 32px;
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
};

export default SummaryCards; 