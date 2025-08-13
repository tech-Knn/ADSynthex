'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, Row, Col, Tabs, Spin, Alert } from 'antd';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PieController
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';
import DashboardLayout from '../../components/Layout/DashboardLayout';
import DateRangePicker from '../../components/Dashboard/DateRangePicker';
import { AdsComArticleData } from '../../lib/adscom-api';
import { GoogleAdsCampaign } from '../../lib/google-ads-api';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PieController
);

export default function Analytics() {
  // State for data
  const [revenueData, setRevenueData] = useState<AdsComArticleData[]>([]);
  const [costData, setCostData] = useState<GoogleAdsCampaign[]>([]);
  
  // State for loading and errors
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from APIs
  const fetchData = async (startDate: string, endDate: string) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch Ads.com revenue data
      const revenueResponse = await axios.post('/api/adscom', {
        startDate,
        endDate
      });

      // Process revenue data
      setRevenueData(revenueResponse.data.data || []);

      // Fetch Google Ads cost data (PRODUCTION - Google Compliant)
      const costResponse = await axios.post('/api/google-ads-production', {
        startDate,
        endDate
      });

      // Process cost data
      setCostData(costResponse.data.campaigns || []);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch analytics data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Handle date range changes
  const handleDateRangeChange = (startDate: string, endDate: string) => {
    fetchData(startDate, endDate);
  };

  // Initial data fetch
  useEffect(() => {
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);

    const startDate = lastMonth.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    fetchData(startDate, endDate);
  }, []);

  // Prepare revenue by article chart data
  const revenueByArticleData = {
    labels: revenueData.slice(0, 10).map(item => {
      const shortName = item.article.split('-').slice(0, 2).join('-');
      return shortName.length > 15 ? shortName.substring(0, 15) + '...' : shortName;
    }),
    datasets: [
      {
        label: 'Revenue',
        data: revenueData.slice(0, 10).map(item => item.revenue),
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      }
    ]
  };

  // Prepare cost by campaign chart data
  const costByCampaignData = {
    labels: costData.slice(0, 10).map(item => {
      return item.campaign_name.length > 15 
        ? item.campaign_name.substring(0, 15) + '...' 
        : item.campaign_name;
    }),
    datasets: [
      {
        label: 'Cost',
        data: costData.slice(0, 10).map(item => item.metrics.cost),
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1,
      }
    ]
  };

  // Prepare CTR comparison chart data
  const ctrComparisonData = {
    labels: ['Revenue Side', 'Cost Side'],
    datasets: [
      {
        label: 'CTR (%)',
        data: [
          revenueData.length > 0 
            ? revenueData.reduce((sum, item) => sum + parseFloat(item.ctr.replace('%', '')), 0) / revenueData.length 
            : 0,
          costData.length > 0 
            ? costData.reduce((sum, item) => sum + item.metrics.ctr, 0) / costData.length 
            : 0
        ],
        backgroundColor: [
          'rgba(75, 192, 192, 0.6)',
          'rgba(255, 99, 132, 0.6)'
        ],
        borderColor: [
          'rgba(75, 192, 192, 1)',
          'rgba(255, 99, 132, 1)'
        ],
        borderWidth: 1,
      }
    ]
  };

  // Prepare revenue vs cost trend data
  const trendData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      {
        label: 'Revenue',
        data: [
          revenueData.slice(0, 5).reduce((sum, item) => sum + item.revenue, 0),
          revenueData.slice(5, 10).reduce((sum, item) => sum + item.revenue, 0),
          revenueData.slice(10, 15).reduce((sum, item) => sum + item.revenue, 0),
          revenueData.slice(15, 20).reduce((sum, item) => sum + item.revenue, 0)
        ],
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Cost',
        data: [
          costData.slice(0, 5).reduce((sum, item) => sum + item.metrics.cost, 0),
          costData.slice(5, 10).reduce((sum, item) => sum + item.metrics.cost, 0),
          costData.slice(10, 15).reduce((sum, item) => sum + item.metrics.cost, 0),
          costData.slice(15, 20).reduce((sum, item) => sum + item.metrics.cost, 0)
        ],
        borderColor: 'rgba(255, 99, 132, 1)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        tension: 0.4,
        fill: true
      }
    ]
  };

  return (
    <DashboardLayout>
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1>Analytics</h1>
          <p>Detailed analytics for Ads.com revenue and Google Ads cost data</p>
        </div>

        {error && (
          <Alert
            message="Error"
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: '24px' }}
          />
        )}

        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <DateRangePicker onDateRangeChange={handleDateRangeChange} />
          </Col>
        </Row>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" />
            <p style={{ marginTop: '16px' }}>Loading analytics data...</p>
          </div>
        ) : (
          <>
            <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
              <Col xs={24} lg={12}>
                <Card title="Revenue by Article (Top 10)">
                  <Bar 
                    data={revenueByArticleData}
                    options={{
                      plugins: {
                        legend: {
                          position: 'top',
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              return `Revenue: $${context.parsed.y.toFixed(2)}`;
                            }
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: function(value) {
                              return '$' + value;
                            }
                          }
                        }
                      }
                    }}
                    height={300}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title="Cost by Campaign (Top 10)">
                  <Bar 
                    data={costByCampaignData}
                    options={{
                      plugins: {
                        legend: {
                          position: 'top',
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              return `Cost: $${context.parsed.y.toFixed(2)}`;
                            }
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: function(value) {
                              return '$' + value;
                            }
                          }
                        }
                      }
                    }}
                    height={300}
                  />
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
              <Col xs={24} lg={12}>
                <Card title="CTR Comparison">
                  <Pie 
                    data={ctrComparisonData}
                    options={{
                      plugins: {
                        legend: {
                          position: 'top',
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              return `CTR: ${context.parsed.toFixed(2)}%`;
                            }
                          }
                        }
                      }
                    }}
                    height={300}
                  />
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card title="Revenue vs Cost Trend">
                  <Line 
                    data={trendData}
                    options={{
                      plugins: {
                        legend: {
                          position: 'top',
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              return `${context.dataset.label}: $${context.parsed.y.toFixed(2)}`;
                            }
                          }
                        }
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: function(value) {
                              return '$' + value;
                            }
                          }
                        }
                      }
                    }}
                    height={300}
                  />
                </Card>
              </Col>
            </Row>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}