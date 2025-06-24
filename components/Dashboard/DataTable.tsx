import React, { useMemo, useState } from 'react';
import { Card, Row, Col, Input, Collapse, Tag, Typography, Tooltip, Empty, Badge, Progress, Table } from 'antd';
import { 
  SearchOutlined, 
  CaretRightOutlined, 
  LinkOutlined, 
  BarChartOutlined, 
  DollarOutlined,
  PercentageOutlined,
  EyeOutlined,
  RiseOutlined,
  FallOutlined
} from '@ant-design/icons';
import { AdsComArticleData, AdsComCountryData } from '../../lib/adscom-api';
import { GoogleAdsAd } from '../../lib/google-ads-api';
import Flag from 'react-world-flags';

const { Panel } = Collapse;
const { Title, Text } = Typography;

// Country flag mapping
const countryFlagEmoji = (countryCode: string): string => {
  // Return empty string for N/A or invalid codes
  if (!countryCode || countryCode.toLowerCase() === 'n/a' || countryCode.length > 2) {
    return '';
  }
  
  // Convert country code to regional indicator symbols (flag emoji)
  const countryCodeUpper = countryCode.toUpperCase();
  const codePoints = [
    127397 + countryCodeUpper.charCodeAt(0),
    127397 + countryCodeUpper.charCodeAt(1)
  ];
  
  return String.fromCodePoint(...codePoints);
};

// Get full country name from code (optional enhancement)
const getCountryName = (countryCode: string): string => {
  const countryNames: {[key: string]: string} = {
    'us': 'United States',
    'ca': 'Canada',
    'gb': 'United Kingdom',
    'fr': 'France',
    'de': 'Germany',
    'it': 'Italy',
    'es': 'Spain',
    'br': 'Brazil',
    'au': 'Australia',
    'jp': 'Japan',
    'cn': 'China',
    'in': 'India',
    'ru': 'Russia',
    'mx': 'Mexico',
    'id': 'Indonesia',
    'ph': 'Philippines',
    'ni': 'Nicaragua',
    've': 'Venezuela',
    // Add more as needed
  };
  
  const code = countryCode.toLowerCase();
  return countryNames[code] || countryCode.toUpperCase();
};

interface DataTableProps {
  revenueData: AdsComArticleData[];
  costData: GoogleAdsAd[];
}

interface CombinedRowData {
  key: string;
  slug: string;
  article: string;
  country: string;
  visits: number;
  clicks: number;
  ctr: number;
  rpm: number;
  epc: number;
  revenue: number;
  impressions: number;
  costClicks: number;
  costCtr: number;
  cpc: number;
  cost: number;
  profit: number;
  roi: number;
  finalUrls: string[];
  finalized?: boolean;
  conversions?: number;
  apiMetrics?: {
    conversionRate: number;
    cpa: number;
  };
  countryBreakdown?: AdsComCountryData[];
}

const DataTable: React.FC<DataTableProps> = ({ revenueData, costData }) => {
  const [searchText, setSearchText] = useState('');
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [countryPageSize, setCountryPageSize] = useState<number>(10);
  const [sortedInfo, setSortedInfo] = useState<{
    columnKey: string | null;
    order: 'ascend' | 'descend' | null;
  }>({
    columnKey: 'profit',
    order: 'descend',
  });
  const [countrySortedInfo, setCountrySortedInfo] = useState<{
    columnKey: string | null;
    order: 'ascend' | 'descend' | null;
  }>({
    columnKey: 'visits',
    order: 'descend',
  });

  // Helper to normalize slugs (lowercase, trim slash, remove extension)
  const normalizeSlug = (raw: string): string => {
    if (!raw) return '';
    
    return decodeURIComponent(raw)
      .toLowerCase()
      .replace(/\?.*$/, '') // remove query params
      .replace(/#.*$/, '') // remove hash
      .replace(/\/$/, '') // remove trailing slash
      .replace(/\.(html?|php|aspx?)$/, '') // remove common extensions
      .trim();
  };
  
  // Format article name for display
  const formatArticleTitle = (slug: string): string => {
    if (!slug) return '';
    
    return slug
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  // Format country display
  const formatCountryDisplay = (country: string): string => {
    if (!country) return 'Unknown';
    
    // If country contains a number followed by 'countries'
    if (/\d+\s+countries/.test(country)) {
      return country;
    }
    
    // If just a country code like 'us', 'id', etc.
    if (country.length <= 2) {
      return country.toUpperCase();
    }
    
    return country;
  };

  // Render country with flag
  const renderCountryWithFlag = (country: string): React.ReactNode => {
    if (!country) return <Tag>No country data</Tag>;
    
    // If country contains a number followed by 'countries'
    if (/\d+\s+countries/.test(country)) {
      return <Tag color="blue">{country}</Tag>;
    }
    
    // If just a country code like 'us', 'id', etc.
    if (country.length <= 2) {
      const countryCode = country.toLowerCase();
      return (
        <Tag color="blue" className="country-tag">
          <div className="country-code-display">
            <span className="country-flag">
              <Flag code={countryCode} height="16" />
            </span>
            <strong>{country.toUpperCase()}</strong>
          </div>
        </Tag>
      );
    }
    
    return <Tag color="blue">{country}</Tag>;
  };

  // Get ROI status color
  const getRoiStatusColor = (roi: number) => {
    if (roi >= 50) return 'success';
    if (roi >= 0) return 'warning';
    return 'error';
  };

  // Get profit status based on value
  const getProfitStatus = (profit: number) => {
    if (profit >= 100) return 'high-profit';
    if (profit >= 0) return 'profit-positive';
    return 'profit-negative';
  };
  
  // Format ROI value for display with appropriate icon
  const formatRoiDisplay = (roi: number, cost: number, revenue: number) => {
    // If no costs at all, show N/A or infinity indicator
    if (cost === 0) {
      return revenue > 0 ? (
        <span className="roi-value roi-success">Infinity%</span>
      ) : (
        <span className="roi-value roi-neutral">N/A</span>
      );
    }
    
    // For Infinity case (just in case)
    if (!isFinite(roi)) {
      return <span className="roi-value roi-success">Infinity%</span>;
    }
    
    // Normal ROI calculation
    const roiClass = `roi-${getRoiStatusColor(roi)}`;
    return <span className={`roi-value ${roiClass}`}>{safeFormat.percentage(roi, 1)}</span>;
  };

  // Safely format numbers
  const safeFormat = {
    number: (value: any, defaultValue = 0): string => {
      return (typeof value === 'number' && !isNaN(value)) 
        ? value.toLocaleString() 
        : defaultValue.toString();
    },
    percentage: (value: any, decimal = 2, defaultValue = 0): string => {
      return (typeof value === 'number' && !isNaN(value))
        ? `${value.toFixed(decimal)}%`
        : `${defaultValue.toFixed(decimal)}%`;
    },
    currency: (value: any, decimal = 2, defaultValue = 0): string => {
      return (typeof value === 'number' && !isNaN(value))
        ? value.toFixed(decimal)
        : defaultValue.toFixed(decimal);
    }
  };

  // Format revenue display with finalized indicator
  const formatRevenueDisplay = (revenue: number, finalized: boolean | undefined) => {
    return (
      <div className="metric-value revenue-value">
        ${safeFormat.currency(revenue, 2)}
        {finalized === false && (
          <Tooltip title="Estimated revenue - may change during the next 72 hours">
            <span className="revenue-estimated-indicator">*</span>
          </Tooltip>
        )}
      </div>
    );
  };

  // Define table columns
  const columns = [
    {
      title: 'Article',
      dataIndex: 'article',
      key: 'article',
      render: (text: string, record: CombinedRowData) => (
        <div className="article-info">
          <div className="article-title">
            {record.article ? (
              record.article.includes('-') 
                ? formatArticleTitle(record.slug)
                : record.article.includes('/') 
                  ? formatArticleTitle(record.slug)
                  : record.article
            ) : formatArticleTitle(record.slug)}
          </div>
          {renderCountryWithFlag(record.country)}
        </div>
      ),
      width: '25%',
      fixed: 'left' as const,
      sorter: (a: CombinedRowData, b: CombinedRowData) => a.article.localeCompare(b.article),
    },
    {
      title: 'Google Ads Metrics',
      children: [
        {
          title: 'Conversion',
          dataIndex: 'conversions',
          key: 'conversions',
          render: (value: number, record: CombinedRowData) => {
            // Ensure conversions are displayed properly, use 0 as fallback
            const conversions = Number(record.conversions || 0);
            return safeFormat.number(conversions);
          },
          width: '7%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => (a.conversions || 0) - (b.conversions || 0),
        },
        {
          title: 'Conv. Rate',
          dataIndex: 'conversionRate',
          key: 'conversionRate',
          render: (value: number, record: CombinedRowData) => {
            // First check if we have API-provided conversion rate
            if (record.apiMetrics?.conversionRate && record.apiMetrics.conversionRate > 0) {
              return safeFormat.percentage(record.apiMetrics.conversionRate);
            }
            
            // If not, calculate conversion rate using formula: (conversion/clicks on ads)*100
            const conversions = Number(record.conversions || 0);
            const clicks = Number(record.costClicks || 0);
            const convRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
            return safeFormat.percentage(convRate);
          },
          width: '7%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => {
            const aRate = a.apiMetrics?.conversionRate || ((a.conversions || 0) / (a.costClicks || 1)) * 100;
            const bRate = b.apiMetrics?.conversionRate || ((b.conversions || 0) / (b.costClicks || 1)) * 100;
            return aRate - bRate;
          },
        },
        {
          title: 'CPC',
          dataIndex: 'cpc',
          key: 'cpc',
          render: (value: number, record: CombinedRowData) => {
            // Ensure we're using the calculated CPC or 0
            const cpc = Number(record.cpc || 0);
            return `$${safeFormat.currency(cpc, 2)}`;
          },
          width: '7%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => (a.cpc || 0) - (b.cpc || 0),
        },
        {
          title: 'CPA',
          dataIndex: 'cpa',
          key: 'cpa',
          render: (value: number, record: CombinedRowData) => {
            // First check if we have API-provided CPA
            if (record.apiMetrics?.cpa && record.apiMetrics.cpa > 0) {
              return `$${safeFormat.currency(record.apiMetrics.cpa, 2)}`;
            }
            
            // If not, calculate CPA using formula: cost/conversion
            const conversions = Number(record.conversions || 0);
            const cost = Number(record.cost || 0);
            const cpa = conversions > 0 ? cost / conversions : 0;
            return `$${safeFormat.currency(cpa, 2)}`;
          },
          width: '7%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => {
            const aCpa = a.apiMetrics?.cpa || ((a.conversions || 0) > 0 ? (a.cost || 0) / (a.conversions || 1) : 0);
            const bCpa = b.apiMetrics?.cpa || ((b.conversions || 0) > 0 ? (b.cost || 0) / (b.conversions || 1) : 0);
            return aCpa - bCpa;
          },
        },
        {
          title: 'CTR',
          dataIndex: 'costCtr',
          key: 'costCtr',
          render: (value: number, record: CombinedRowData) => {
            // Ensure we're using the calculated CTR or 0
            const ctr = Number(record.costCtr || 0);
            return safeFormat.percentage(ctr);
          },
          width: '7%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => (a.costCtr || 0) - (b.costCtr || 0),
        },
        {
          title: 'Cost',
          dataIndex: 'cost',
          key: 'cost',
          render: (value: number, record: CombinedRowData) => {
            // Ensure we're using a valid cost value
            const cost = Number(record.cost || 0);
            return (
              <div className="metric-value text-error">${safeFormat.currency(cost, 2)}</div>
            );
          },
          width: '7%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => (a.cost || 0) - (b.cost || 0),
        },
      ],
    },
    {
      title: 'Ads.com Metrics',
      children: [
        {
          title: 'Visits',
          dataIndex: 'visits',
          key: 'visits',
          render: (value: number) => safeFormat.number(value),
          width: '6%',
          sorter: (a: any, b: any) => a.visits - b.visits,
          defaultSortOrder: 'descend' as const,
        },
        {
          title: 'CTR',
          dataIndex: 'ctr',
          key: 'ctr',
          render: (value: number) => safeFormat.percentage(value),
          width: '6%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.ctr - b.ctr,
        },
        {
          title: 'EPC',
          dataIndex: 'epc',
          key: 'epc',
          render: (value: number) => `$${safeFormat.currency(value, 4)}`,
          width: '6%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.epc - b.epc,
        },
        {
          title: 'Clicks',
          dataIndex: 'clicks',
          key: 'clicks',
          render: (value: number) => safeFormat.number(value),
          width: '6%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.clicks - b.clicks,
        },
        {
          title: 'Revenue',
          dataIndex: 'revenue',
          key: 'revenue',
          render: (value: number, record: CombinedRowData) => formatRevenueDisplay(value, record.finalized),
          width: '6%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.revenue - b.revenue,
        },
        {
          title: 'Profit',
          dataIndex: 'profit',
          key: 'profit',
          render: (value: number) => (
            <div className={`metric-value ${value >= 0 ? 'profit-positive' : 'profit-negative'}`}>
              ${safeFormat.currency(Math.abs(value), 2)}
            </div>
          ),
          width: '6%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.profit - b.profit,
          defaultSortOrder: 'descend' as const,
        },
        {
          title: 'ROI',
          dataIndex: 'roi',
          key: 'roi',
          render: (value: number, record: CombinedRowData) => (
            <div className={`roi-value ${getRoiStatusColor(value) === 'success' ? 'text-success' : getRoiStatusColor(value) === 'warning' ? 'text-warning' : 'text-error'}`}>
              {safeFormat.percentage(value, 1)}
            </div>
          ),
          width: '6%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.roi - b.roi,
        },
      ],
    }
  ];

  // Process and combine data
  const combinedData = useMemo(() => {
    const combined: CombinedRowData[] = [];
    const slugMap: Record<string, CombinedRowData> = {};
    const hasProcessedUrls: string[] = [];
    
    // Process revenue data
    revenueData.forEach(article => {
      // Extract slug from article name
      const slug = normalizeSlug(article.article);
      
      // Get finalized status from the article data
      const finalizedRevenue = article.revenue;
      
      const row: CombinedRowData = {
        key: slug,
        slug,
        article: article.article,
        country: article.country,
        visits: article.visits,
        clicks: article.clicks,
        ctr: typeof article.ctr === 'string' ? parseFloat(article.ctr.replace('%', '')) : article.ctr,
        rpm: article.rpm,
        epc: article.epc,
        revenue: article.revenue,
        impressions: 0,
        costClicks: 0,
        costCtr: 0,
        cpc: 0,
        cost: 0,
        profit: article.revenue,
        roi: 0,
        finalUrls: [],
        finalized: article.finalized,
        conversions: 0,
        countryBreakdown: article.countryBreakdown,
      };
      combined.push(row);
      slugMap[slug] = row;
    });
    
    // Match cost data with revenue data
    costData.forEach(ad => {
      if (!ad.final_urls || ad.final_urls.length === 0) return;
      
      ad.final_urls.forEach((url) => {
        const cleanUrl = url.split('?')[0].replace(/\/$/, '');
        const urlParts = cleanUrl.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        const slug = normalizeSlug(lastPart);
        
        if (!slug) return; // Skip empty slugs

        // Improved matching logic with multiple fallbacks
        let targetRow: CombinedRowData | undefined = slugMap[slug];
        
        // If no exact match, try different matching strategies:
        if (!targetRow) {
          // 1. Try to match by article title containing the slug
          targetRow = combined.find(item => 
            item.article && item.article.toLowerCase().includes(slug.toLowerCase())
          );
          
          // 2. If still no match, try partial slug matching
          if (!targetRow) {
            targetRow = combined.find(item => {
              const itemSlug = item.slug || '';
              const currentSlug = slug || '';
              return (itemSlug.length > 3 && currentSlug.length > 3) && 
                     (itemSlug.includes(currentSlug) || currentSlug.includes(itemSlug));
            });
          }
          
          // 3. Try to match by keywords in the article title
          if (!targetRow) {
            // Extract keywords from slug (words at least 5 chars long)
            const keywords = slug.split('-')
              .filter(word => word.length >= 5);
              
            if (keywords.length > 0) {
              targetRow = combined.find(item => {
                return keywords.some(keyword => 
                  item.article && item.article.toLowerCase().includes(keyword)
                );
              });
            }
          }
        }

        if (targetRow) {
          // Extract metrics with default values to prevent undefined
          const impressions = Number(ad.metrics?.impressions || 0);
          const clicks = Number(ad.metrics?.clicks || 0);
          const cost = Number(ad.metrics?.cost || 0);
          const conversions = Number(ad.metrics?.conversions || 0);
          const apiCpa = Number(ad.metrics?.cpa || 0);
          const apiConversionRate = Number(ad.metrics?.conversion_rate || 0);

          // Add the cost metrics to the row
          targetRow.impressions += impressions;
          targetRow.costClicks += clicks;
          
          // Calculate CTR using formula: (clicks on ad/impression)*100
          targetRow.costCtr = targetRow.impressions > 0 ? 
            (targetRow.costClicks / targetRow.impressions) * 100 : 0;
            
          // Calculate CPC using formula: cost/clicks on ad
          targetRow.cpc = targetRow.costClicks > 0 ? 
            cost / targetRow.costClicks : 0;
            
          targetRow.cost += cost;
          targetRow.conversions = (targetRow.conversions || 0) + conversions;
          targetRow.profit = targetRow.revenue - targetRow.cost;
          
          // Store API-provided metrics if available for later use
          if (!targetRow.apiMetrics) {
            targetRow.apiMetrics = {
              conversionRate: apiConversionRate,
              cpa: apiCpa
            };
          } else if (apiConversionRate || apiCpa) {
            // Update with new values if we have them
            targetRow.apiMetrics.conversionRate = apiConversionRate || targetRow.apiMetrics.conversionRate;
            targetRow.apiMetrics.cpa = apiCpa || targetRow.apiMetrics.cpa;
          }
          
          // Calculate ROI using correct formula: (Profit / Cost) * 100%
          if (targetRow.cost > 0) {
            // With cost: ROI = (Profit / Cost) * 100%
            targetRow.roi = (targetRow.profit / targetRow.cost) * 100;
          } else if (targetRow.revenue > 0) {
            // Revenue without cost = infinite ROI
            targetRow.roi = Infinity;
          } else {
            // If neither revenue nor cost, ROI is 0%
            targetRow.roi = 0;
          }
          
          targetRow.finalUrls = Array.from(new Set([...targetRow.finalUrls, url]));
        } else {
          // Skip ads that we've already matched to articles
          if (hasProcessedUrls.some(url => ad.final_urls?.includes(url))) return;

          // Create a new row for each unmatched ad URL
          ad.final_urls?.forEach(url => {
            if (!hasProcessedUrls.includes(url)) {
              hasProcessedUrls.push(url);

              // Extract article name from URL
              const urlParts = url.split('/');
              const lastPart = urlParts[urlParts.length - 1].split('?')[0];
              const slug = normalizeSlug(lastPart);

              // Extract metrics with default values to prevent undefined
              const impressions = Number(ad.metrics?.impressions || 0);
              const clicks = Number(ad.metrics?.clicks || 0);
              const cost = Number(ad.metrics?.cost || 0);
              const conversions = Number(ad.metrics?.conversions || 0);
              const apiCpa = Number(ad.metrics?.cpa || 0);
              const apiConversionRate = Number(ad.metrics?.conversion_rate || 0);

              // Create new row for this cost
              const newRow: CombinedRowData = {
                key: `cost-${slug || url}`,
                slug: slug || url,
                article: url,
                country: '',
                visits: 0,
                clicks: 0,
                ctr: 0,
                rpm: 0,
                epc: 0,
                revenue: 0,
                impressions: impressions,
                costClicks: clicks,
                // Calculate CTR using formula: (clicks on ad/impression)*100
                costCtr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                // Calculate CPC using formula: cost/clicks on ad
                cpc: clicks > 0 ? cost / clicks : 0,
                cost: cost,
                profit: -cost,
                roi: -100, // Negative 100% ROI when there's cost but no revenue
                finalUrls: [url],
                finalized: false,
                conversions: conversions,
                // Store API-provided metrics if available
                apiMetrics: {
                  conversionRate: apiConversionRate,
                  cpa: apiCpa
                }
              };
              combined.push(newRow);
            }
          });
        }
      });
    });
    
    // Sort by profit (highest first)
    return combined.sort((a, b) => b.profit - a.profit);
  }, [revenueData, costData]);

  // Filter data based on search text
  const filteredData = useMemo(() => {
    if (!searchText) return combinedData;
    
    return combinedData.filter(item => 
      item.article.toLowerCase().includes(searchText.toLowerCase()) ||
      item.country.toLowerCase().includes(searchText.toLowerCase()) ||
      (item.finalUrls.length > 0 && item.finalUrls.some(url => url.toLowerCase().includes(searchText.toLowerCase())))
    );
  }, [combinedData, searchText]);

  const toggleExpand = (key: string) => {
    setExpandedItems(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key) 
        : [...prev, key]
    );
  };

  // Generate country breakdown data
  const generateCountryBreakdown = (record: CombinedRowData) => {
    // If there's no breakdown data, return an empty array
    if (!record.countryBreakdown || record.countryBreakdown.length === 0) {
      return [];
    }
  
    const totalRevenue = record.countryBreakdown.reduce((sum, country) => sum + country.revenue, 0);
    const totalCost = record.cost || 0;
  
    return record.countryBreakdown.map(country => {
      // Distribute total cost proportionally based on revenue
      const revenueShare = totalRevenue > 0 ? country.revenue / totalRevenue : 0;
      const cost = totalCost * revenueShare;
  
      // Fake Google Ads metrics for now, proportional to cost
      const conversions = Math.round((record.conversions || 0) * revenueShare);
      const costClicks = Math.round((record.costClicks || 0) * revenueShare);
      const impressions = costClicks * 25; // Estimate
  
      const conversionRate = costClicks > 0 ? (conversions / costClicks) * 100 : 0;
      const cpc = costClicks > 0 ? cost / costClicks : 0;
      const cpa = conversions > 0 ? cost / conversions : 0;
      const costCtr = impressions > 0 ? (costClicks / impressions) * 100 : 0;
  
      const profit = country.revenue - cost;
  
      return {
        ...country,
        key: country.country,
        cost,
        profit,
        conversions,
        conversionRate,
        cpc,
        cpa,
        costCtr,
      };
    }).sort((a, b) => b.visits - a.visits);
  };

  // Define expandable row render function
  const expandedRowRender = (record: CombinedRowData) => (
    <div className="expanded-row-content">
      {record.country ? (
        <Card title={
          <div className="detail-card-title">
            <div className="detail-card-icon-wrapper country-icon">
              <LinkOutlined className="detail-card-icon" />
            </div>
            <span>Country Breakdown{record.country ? `: ${record.country}` : ''}</span>
          </div>
        } size="small" className="detail-card">
          <Table 
            dataSource={generateCountryBreakdown(record)}
            onChange={(pagination, filters, sorter: any) => {
              setCountrySortedInfo({
                columnKey: sorter.columnKey,
                order: sorter.order,
              });
            }}
            columns={[
              {
                title: 'Country',
                dataIndex: 'country',
                key: 'country',
                render: (text: string) => {
                  if (text === 'N/A') {
                    return (
                      <div className="country-code-display">
                        <strong>N/A</strong>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="country-code-display">
                      <Flag code={text} height="16" className="country-flag-image" />
                      <strong>{text.toUpperCase()}</strong>
                    </div>
                  );
                },
                fixed: 'left' as const,
                sorter: (a: any, b: any) => a.country.localeCompare(b.country),
              },
              {
                title: 'Google Ads Metrics',
                children: [
                  {
                    title: 'Conversion',
                    dataIndex: 'conversions',
                    key: 'conversions',
                    render: (value: number) => safeFormat.number(value),
                    sorter: (a: any, b: any) => (a.conversions || 0) - (b.conversions || 0),
                  },
                  {
                    title: 'Conv. Rate',
                    dataIndex: 'conversionRate',
                    key: 'conversionRate',
                    render: (value: number) => safeFormat.percentage(value),
                    sorter: (a: any, b: any) => (a.conversionRate || 0) - (b.conversionRate || 0),
                  },
                  {
                    title: 'CPC',
                    dataIndex: 'cpc',
                    key: 'cpc',
                    render: (value: number) => `$${safeFormat.currency(value, 2)}`,
                    sorter: (a: any, b: any) => (a.cpc || 0) - (b.cpc || 0),
                  },
                  {
                    title: 'CPA',
                    dataIndex: 'cpa',
                    key: 'cpa',
                    render: (value: number) => `$${safeFormat.currency(value, 2)}`,
                    sorter: (a: any, b: any) => (a.cpa || 0) - (b.cpa || 0),
                  },
                  {
                    title: 'CTR',
                    dataIndex: 'costCtr',
                    key: 'costCtr',
                    render: (value: number) => safeFormat.percentage(value),
                    sorter: (a: any, b: any) => (a.costCtr || 0) - (b.costCtr || 0),
                  },
                  {
                    title: 'Cost',
                    dataIndex: 'cost',
                    key: 'cost',
                    render: (value: number) => (
                      <div className="metric-value text-error">${safeFormat.currency(value, 2)}</div>
                    ),
                    sorter: (a: any, b: any) => (a.cost || 0) - (b.cost || 0),
                  },
                ]
              },
              {
                title: 'Ads.com Metrics',
                children: [
                  {
                    title: 'Visits',
                    dataIndex: 'visits',
                    key: 'visits',
                    render: (value: number) => safeFormat.number(value),
                    sorter: (a: any, b: any) => a.visits - b.visits,
                    defaultSortOrder: 'descend' as const,
                  },
                  {
                    title: 'CTR',
                    dataIndex: 'ctr',
                    key: 'ctr',
                    render: (value: number) => safeFormat.percentage(value),
                    sorter: (a: any, b: any) => a.ctr - b.ctr,
                  },
                  {
                    title: 'EPC',
                    dataIndex: 'epc',
                    key: 'epc',
                    render: (value: number) => `$${safeFormat.currency(value, 4)}`,
                    sorter: (a: any, b: any) => a.epc - b.epc,
                  },
                  {
                    title: 'Clicks',
                    dataIndex: 'clicks',
                    key: 'clicks',
                    render: (value: number) => safeFormat.number(value),
                    sorter: (a: any, b: any) => a.clicks - b.clicks,
                  },
                  {
                    title: 'Revenue',
                    dataIndex: 'revenue',
                    key: 'revenue',
                    render: (value: number) => `$${safeFormat.currency(value, 2)}`,
                    sorter: (a: any, b: any) => a.revenue - b.revenue,
                  },
                  {
                    title: 'Profit',
                    dataIndex: 'profit',
                    key: 'profit',
                    render: (value: number) => (
                      <div className={`metric-value ${value >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                        ${safeFormat.currency(Math.abs(value), 2)}
                      </div>
                    ),
                    sorter: (a: any, b: any) => a.profit - b.profit,
                  },
                ]
              }
            ]}
            pagination={{ 
              pageSize: countryPageSize,
              showSizeChanger: true,
              pageSizeOptions: ['5', '10', '20', '50'],
              showTotal: (total) => `Total: ${total} ${total === 1 ? 'country' : 'countries'}`,
              onChange: (page, size) => {
                setCountryPageSize(size);
              },
              onShowSizeChange: (current, size) => {
                setCountryPageSize(size);
              }
            }}
            size="small"
            scroll={{ x: 'max-content' }}
            bordered
          />
        </Card>
      ) : (
        record.finalUrls.length > 0 && (
          <Card title={
            <div className="detail-card-title">
              <div className="detail-card-icon-wrapper url-icon">
                <LinkOutlined className="detail-card-icon" />
              </div>
              <span>Final URLs</span>
            </div>
          } size="small" className="detail-card">
            <div className="url-grid">
              {record.finalUrls.map((url, index) => (
                <div key={index} className="url-item">
                  <LinkOutlined className="url-icon-small" /> 
                  <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                </div>
              ))}
            </div>
          </Card>
        )
      )}
    </div>
  );

  return (
    <div className="data-table-container">
      <div className="table-header">
        <div className="table-title">
          <div className="table-icon-wrapper">
            <BarChartOutlined className="table-icon" />
          </div>
          <Title level={4}>Article Performance Report</Title>
          <Text type="secondary">{filteredData.length} Articles found</Text>
        </div>
        <div className="table-actions">
          <div className="table-search">
            <Input
              placeholder="Search Article or Country..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
            />
          </div>
        </div>
      </div>
      
      <Table
        dataSource={filteredData}
        columns={columns}
        rowKey="key"
        expandable={{
          expandedRowRender,
          expandedRowKeys: expandedItems,
          onExpand: (expanded, record) => toggleExpand(record.key)
        }}
        pagination={{
          pageSize: pageSize,
          current: currentPage,
          total: filteredData.length,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} articles`,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          },
          onShowSizeChange: (current, size) => {
            setPageSize(size);
            setCurrentPage(1); // Reset to first page when changing page size
          }
        }}
        onChange={(pagination, filters, sorter: any) => {
          setSortedInfo({
            columnKey: sorter.columnKey,
            order: sorter.order,
          });
        }}
        scroll={{ x: 'max-content' }}
        size="middle"
        bordered
      />
      
      <style jsx global>{`
        .data-table-container {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          padding: 20px;
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
        
        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        
        .table-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }
        
        .table-title {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .table-icon-wrapper {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
        }
        
        .table-icon {
          color: white;
          font-size: 20px;
        }
        
        .table-title h4 {
          margin: 0 12px 0 0;
          font-weight: 600;
        }
        
        .table-search {
          width: 300px;
          max-width: 100%;
        }
        
        .article-info {
          display: flex;
          flex-direction: column;
        }
        
        .article-title {
          font-weight: 500;
          margin-bottom: 8px;
          color: #1f2937;
          word-break: break-word;
        }
        
        .country-tag {
          margin-top: 4px;
          display: inline-flex;
          align-items: center;
        }
        
        .country-code-display {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .country-flag {
          margin-right: 4px;
          display: flex;
          align-items: center;
        }
        
        .metric-value {
          font-weight: 500;
          display: flex;
          align-items: center;
        }
        
        .text-primary {
          color: #4f46e5;
        }
        
        .text-secondary {
          color: #f59e0b;
        }
        
        .text-success {
          color: #10b981;
        }
        
        .text-error {
          color: #ef4444;
        }
        
        .text-warning {
          color: #f59e0b;
        }
        
        .profit-positive {
          color: #10b981;
        }
        
        .profit-negative {
          color: #ef4444;
        }
        
        .metric-icon {
          margin-left: 4px;
          font-size: 12px;
        }
        
        .roi-value {
          font-weight: 500;
        }
        
        .roi-success {
          color: #10b981;
        }
        
        .roi-warning {
          color: #f59e0b;
        }
        
        .roi-error {
          color: #ef4444;
        }
        
        .roi-neutral {
          color: #6b7280;
        }
        
        .revenue-estimated-indicator {
          color: #f59e0b;
          margin-left: 2px;
          font-weight: bold;
        }
        
        .expanded-row-content {
          padding: 16px 0;
        }
        
        .detail-card {
          margin-bottom: 16px;
          border-radius: 8px;
        }
        
        .detail-card .ant-card-head {
          background-color: #f9fafb;
          border-bottom: none;
          padding: 0 16px;
        }
        
        .detail-card-title {
          display: flex;
          align-items: center;
          font-size: 16px;
          font-weight: 600;
          color: #374151;
        }
        
        .detail-card-icon-wrapper {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 8px;
        }
        
        .detail-card-icon {
          color: white;
          font-size: 14px;
        }
        
        .country-icon {
          background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
        }
        
        .url-icon {
          background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
        }
        
        .country-flag-image {
          margin-right: 6px;
        }
        
        /* Country breakdown table styling */
        .ant-table {
          font-size: 14px;
        }
        
        .ant-table-thead > tr > th {
          font-size: 14px;
          font-weight: 600;
          background-color: #f9fafb;
          text-align: center;
          padding: 10px 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .ant-table-thead > tr > th:hover {
          background-color: #f0f5ff !important;
        }
        
        .ant-table-column-sorter {
          color: #4f46e5;
        }
        
        .ant-table-column-sort {
          background-color: #f0f5ff;
        }
        
        .ant-table-tbody > tr > td {
          font-size: 14px;
          padding: 10px 8px;
          text-align: center;
        }
        
        .country-code-display {
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }
        
        .country-flag-image {
          margin-right: 8px;
          border: 1px solid rgba(0,0,0,0.05);
          border-radius: 2px;
        }
        
        .metric-value {
          font-size: 14px;
          font-weight: 500;
        }
        
        .roi-value {
          font-size: 14px;
          font-weight: 500;
        }
        
        .ivt-value {
          font-size: 14px;
          font-weight: 500;
        }
        
        /* Pagination styling */
        .ant-pagination {
          font-size: 14px;
          margin-top: 16px;
          text-align: right;
        }
        
        .ant-pagination-options-size-changer.ant-select {
          min-width: 110px;
          font-size: 14px;
        }
        
        .ant-pagination-options {
          margin-left: 16px;
        }
        
        .ant-pagination-item-active {
          font-weight: 600;
          background: #f0f5ff;
          border-color: #4f46e5;
        }
        
        .ant-pagination-item-active a {
          color: #4f46e5;
        }
        
        .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {
          color: #4f46e5;
          font-weight: 600;
          background-color: #f0f5ff;
        }
        
        /* Performance indicators */
        .profit-positive, .text-success {
          color: #10b981;
        }
        
        .profit-negative, .text-error {
          color: #ef4444;
        }
        
        .text-warning {
          color: #f59e0b;
        }
      `}</style>
    </div>
  );
};

export default DataTable; 