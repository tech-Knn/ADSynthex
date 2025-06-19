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
import { AdsComArticleData } from '../../lib/adscom-api';
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
  initialRevenue: number;
  ivtCorrection: number;
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
}

const DataTable: React.FC<DataTableProps> = ({ revenueData, costData }) => {
  const [searchText, setSearchText] = useState('');
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

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
        <span className="roi-value roi-success">∞%</span>
      ) : (
        <span className="roi-value roi-neutral">N/A</span>
      );
    }
    
    // For Infinity case (just in case)
    if (!isFinite(roi)) {
      return <span className="roi-value roi-success">∞%</span>;
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
        },
        {
          title: 'CTR',
          dataIndex: 'ctr',
          key: 'ctr',
          render: (value: number) => safeFormat.percentage(value),
          width: '6%',
        },
        {
          title: 'EPC',
          dataIndex: 'epc',
          key: 'epc',
          render: (value: number) => `$${safeFormat.currency(value, 4)}`,
          width: '6%',
        },
        {
          title: 'Clicks',
          dataIndex: 'clicks',
          key: 'clicks',
          render: (value: number) => safeFormat.number(value),
          width: '6%',
        },
        {
          title: 'RPM',
          dataIndex: 'rpm',
          key: 'rpm',
          render: (value: number) => `$${safeFormat.currency(value, 2)}`,
          width: '6%',
        },
        {
          title: 'Revenue',
          dataIndex: 'revenue',
          key: 'revenue',
          render: (value: number, record: CombinedRowData) => formatRevenueDisplay(value, record.finalized),
          width: '6%',
        },
        {
          title: 'Profit',
          dataIndex: 'profit',
          key: 'profit',
          render: (value: number) => (
            <div className={`metric-value ${value >= 0 ? 'profit-positive' : 'profit-negative'}`}>
              ${safeFormat.currency(Math.abs(value), 2)}
              {value >= 0 ? (
                <RiseOutlined className="metric-icon profit-positive" style={{ marginLeft: '5px' }} />
              ) : (
                <FallOutlined className="metric-icon profit-negative" style={{ marginLeft: '5px' }} />
              )}
            </div>
          ),
          width: '6%',
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
        },
        {
          title: 'IVT',
          dataIndex: 'ivtCorrection',
          key: 'ivtCorrection',
          render: (value: number) => (
            <div className={value >= 0 ? 'text-success' : 'text-error'}>
              {value >= 0 ? '+' : ''}${safeFormat.currency(value, 2)}
            </div>
          ),
          width: '6%',
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
        initialRevenue: article.initialRevenue || article.revenue,
        ivtCorrection: article.ivtCorrection || 0,
        impressions: 0,
        costClicks: 0,
        costCtr: 0,
        cpc: 0,
        cost: 0,
        profit: article.revenue,
        roi: 0,
        finalUrls: [],
        finalized: article.finalized,
        conversions: 0
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
                initialRevenue: 0,
                ivtCorrection: 0,
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

  // Generate mock country breakdown data
  const generateCountryBreakdown = (record: CombinedRowData) => {
    // Extract country information from the record
    const countryText = record.country || '';
    const countryCount = parseInt(countryText.match(/\d+/)?.[0] || '0');
    
    // Create country-specific data entries
    const countryData = [];
    
    // Common country codes for demonstration - expanded list with more countries
    const countryCodes = [
      'id', 'au', 'us', 'br', 'it', 'in', 'ph', 'es', 'gb', 'ca', 
      'fr', 'de', 'mx', 'jp', 'cn', 'ru', 'ar', 'nl', 'se', 'sg'
    ];
    const totalVisits = record.visits;
    const totalClicks = record.clicks;
    const totalRevenue = record.revenue;
    const totalCost = record.cost;
    
    // Generate country breakdown data
    const countriesToShow = Math.min(countryCount || 10, 20);
    
    for (let i = 0; i < countriesToShow; i++) {
      // Create random but realistic distribution of metrics
      const countryCode = countryCodes[i % countryCodes.length];
      const visitShare = Math.random() * 0.3 + 0.01; // 1% to 31% of total visits
      const visits = Math.round(totalVisits * visitShare);
      const clickRate = Math.random() * 2 + 0.5; // 0.5x to 2.5x the average CTR
      const clicks = Math.round(visits * clickRate * (record.ctr / 100));
      const ctr = clicks > 0 && visits > 0 ? (clicks / visits) * 100 : 0;
      
      // Calculate additional metrics for this country
      const revenueShare = Math.random() * 0.4 + 0.01; // 1% to 41% of total revenue
      const revenue = Math.round(totalRevenue * revenueShare * 100) / 100;
      const rpm = visits > 0 ? (revenue / visits) * 1000 : 0;
      const epc = clicks > 0 ? revenue / clicks : 0;
      
      // Google Ads metrics
      const costShare = Math.random() * 0.35 + 0.01; // 1% to 36% of total cost
      const cost = Math.round(totalCost * costShare * 100) / 100;
      const impressions = Math.round(visits * (Math.random() * 3 + 1.5)); // 1.5x to 4.5x visits
      const costClicks = Math.round(clicks * (Math.random() * 0.5 + 0.5)); // 50% to 100% of clicks
      const costCtr = impressions > 0 ? (costClicks / impressions) * 100 : 0;
      const cpc = costClicks > 0 ? cost / costClicks : 0;
      const conversions = Math.round(costClicks * (Math.random() * 0.1)); // 0% to 10% conversion rate
      const conversionRate = costClicks > 0 ? (conversions / costClicks) * 100 : 0;
      const cpa = conversions > 0 ? cost / conversions : 0;
      
      // Calculate profit and ROI
      const profit = revenue - cost;
      const roi = cost > 0 ? (profit / cost) * 100 : revenue > 0 ? Infinity : 0;
      
      countryData.push({
        key: countryCode,
        country: countryCode,
        visits: visits,
        clicks: clicks,
        ctr: ctr,
        rpm: rpm,
        epc: epc,
        revenue: revenue,
        impressions: impressions,
        costClicks: costClicks,
        costCtr: costCtr,
        cpc: cpc,
        cost: cost,
        profit: profit,
        roi: roi,
        conversions: conversions,
        conversionRate: conversionRate,
        cpa: cpa
      });
    }
    
    // If we have N/A data, add it as well
    countryData.push({
      key: 'n/a',
      country: 'N/A',
      countryName: 'N/A',
      visits: Math.round(totalVisits * 0.05),
      clicks: Math.round(totalClicks * 0.03),
      ctr: 30.0,
      rpm: Math.round(record.rpm * 0.8 * 100) / 100,
      epc: Math.round(record.epc * 0.7 * 10000) / 10000,
      revenue: Math.round(totalRevenue * 0.04 * 100) / 100,
      impressions: Math.round(totalVisits * 0.05 * 2),
      costClicks: Math.round(totalClicks * 0.03 * 0.7),
      costCtr: 25.0,
      cpc: Math.round(record.cpc * 0.9 * 100) / 100,
      cost: Math.round(totalCost * 0.03 * 100) / 100,
      profit: Math.round((totalRevenue * 0.04 - totalCost * 0.03) * 100) / 100,
      roi: Math.round(((totalRevenue * 0.04 - totalCost * 0.03) / (totalCost * 0.03)) * 100),
      conversions: Math.round(totalClicks * 0.03 * 0.7 * 0.05),
      conversionRate: 5.0,
      cpa: Math.round(record.cpc * 20 * 100) / 100
    });
    
    // Sort by visits (highest first)
    return countryData.sort((a, b) => b.visits - a.visits);
  };

  // Define expandable row render function
  const expandedRowRender = (record: CombinedRowData) => (
    <div className="expanded-row-content">
      {record.country && record.country.includes('countries') ? (
        <Card title={
          <div className="detail-card-title">
            <div className="detail-card-icon-wrapper country-icon">
              <LinkOutlined className="detail-card-icon" />
            </div>
            <span>Country Breakdown</span>
          </div>
        } size="small" className="detail-card">
          <Table 
            dataSource={generateCountryBreakdown(record)}
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
              },
              {
                title: 'Google Ads Metrics',
                children: [
                  {
                    title: 'Conversion',
                    dataIndex: 'conversions',
                    key: 'conversions',
                    render: (value: number) => safeFormat.number(value),
                  },
                  {
                    title: 'Conv. Rate',
                    dataIndex: 'conversionRate',
                    key: 'conversionRate',
                    render: (value: number) => safeFormat.percentage(value),
                  },
                  {
                    title: 'CPC',
                    dataIndex: 'cpc',
                    key: 'cpc',
                    render: (value: number) => `$${safeFormat.currency(value, 2)}`,
                  },
                  {
                    title: 'CPA',
                    dataIndex: 'cpa',
                    key: 'cpa',
                    render: (value: number) => `$${safeFormat.currency(value, 2)}`,
                  },
                  {
                    title: 'CTR',
                    dataIndex: 'costCtr',
                    key: 'costCtr',
                    render: (value: number) => safeFormat.percentage(value),
                  },
                  {
                    title: 'Cost',
                    dataIndex: 'cost',
                    key: 'cost',
                    render: (value: number) => (
                      <div className="metric-value text-error">${safeFormat.currency(value, 2)}</div>
                    ),
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
                  },
                  {
                    title: 'CTR',
                    dataIndex: 'ctr',
                    key: 'ctr',
                    render: (value: number) => safeFormat.percentage(value),
                  },
                  {
                    title: 'EPC',
                    dataIndex: 'epc',
                    key: 'epc',
                    render: (value: number) => `$${safeFormat.currency(value, 4)}`,
                  },
                  {
                    title: 'Clicks',
                    dataIndex: 'clicks',
                    key: 'clicks',
                    render: (value: number) => safeFormat.number(value),
                  },
                  {
                    title: 'RPM',
                    dataIndex: 'rpm',
                    key: 'rpm',
                    render: (value: number) => `$${safeFormat.currency(value, 2)}`,
                  },
                  {
                    title: 'Revenue',
                    dataIndex: 'revenue',
                    key: 'revenue',
                    render: (value: number) => `$${safeFormat.currency(value, 2)}`,
                  },
                ]
              },
              {
                title: 'Performance',
                children: [
                  {
                    title: 'Profit',
                    dataIndex: 'profit',
                    key: 'profit',
                    render: (value: number) => (
                      <div className={`metric-value ${value >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                        ${safeFormat.currency(Math.abs(value), 2)}
                        {value >= 0 ? (
                          <RiseOutlined className="metric-icon profit-positive" style={{ marginLeft: '5px' }} />
                        ) : (
                          <FallOutlined className="metric-icon profit-negative" style={{ marginLeft: '5px' }} />
                        )}
                      </div>
                    ),
                  },
                  {
                    title: 'ROI',
                    dataIndex: 'roi',
                    key: 'roi',
                    render: (value: number) => (
                      <div className={`roi-value ${getRoiStatusColor(value) === 'success' ? 'text-success' : getRoiStatusColor(value) === 'warning' ? 'text-warning' : 'text-error'}`}>
                        {safeFormat.percentage(value, 1)}
                      </div>
                    ),
                  },
                ]
              }
            ]}
            pagination={false}
            size="small"
            className="country-breakdown-table"
            scroll={{ x: 1500 }}
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
    <div className="article-performance-container fade-in">
      <Card className="article-performance-card">
        <div className="header-container">
          <div className="header-title">
            <div className="header-icon-wrapper">
              <BarChartOutlined className="header-icon" />
            </div>
            <div>
              <Title level={4}>Article Performance Report</Title>
              <Text type="secondary">{filteredData.length} Articles found</Text>
            </div>
          </div>
          <div className="header-actions">
            <div className="search-container">
              <SearchOutlined className="search-icon" />
              <Input 
                placeholder="Search Article or Country..." 
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="search-input"
              />
            </div>
          </div>
        </div>

        {filteredData.length === 0 ? (
          <Empty 
            description="No articles found" 
            image={Empty.PRESENTED_IMAGE_SIMPLE} 
            className="empty-data"
          />
        ) : (
          <Table 
            dataSource={filteredData}
            columns={columns}
            rowKey="key"
            pagination={false}
            bordered
            expandable={{
              expandedRowRender,
              rowExpandable: (record: CombinedRowData): boolean => {
                return record.finalUrls.length > 0 || !!(record.country && record.country.includes('countries'));
              },
              expandRowByClick: true
            }}
            className="performance-table"
            scroll={{ x: 1800 }}
          />
        )}
      </Card>

      <style jsx global>{`
        .article-performance-container {
          font-family: var(--font-family);
          margin-top: 32px;
          position: relative;
        }
        
        .article-performance-card {
          border-radius: var(--border-radius);
          box-shadow: var(--card-shadow);
          overflow: hidden;
        }
        
        /* Add scroll indicator */
        .article-performance-card::after {
          content: "";
          position: absolute;
          top: 50%;
          right: 12px;
          width: 24px;
          height: 24px;
          background-color: rgba(79, 70, 229, 0.6);
          border-radius: 50%;
          transform: translateY(-50%);
          animation: pulse 2s infinite;
          box-shadow: 0 0 0 rgba(79, 70, 229, 0.4);
          opacity: 0.8;
          pointer-events: none;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        /* Add scroll indicator arrow */
        .article-performance-card::before {
          content: "→";
          position: absolute;
          top: 50%;
          right: 16px;
          transform: translateY(-50%);
          color: white;
          font-weight: bold;
          font-size: 16px;
          z-index: 11;
          pointer-events: none;
        }
        
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.4);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(79, 70, 229, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(79, 70, 229, 0);
          }
        }
        
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        
        .header-title {
          display: flex;
          align-items: center;
        }
        
        .header-icon-wrapper {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: var(--primary-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 16px;
          box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2);
        }
        
        .header-icon {
          font-size: 24px;
          color: white;
        }
        
        .header-title h4 {
          margin-bottom: 4px;
          font-weight: 600;
        }
        
        .header-actions {
          display: flex;
          align-items: center;
        }
        
        .search-container {
          position: relative;
        }
        
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-secondary);
          z-index: 1;
        }
        
        .search-input {
          width: 300px;
          padding-left: 36px;
          border-radius: var(--border-radius-sm);
          border: 1px solid var(--border-color);
          background-color: #f9fafb;
        }
        
        .search-input:focus,
        .search-input:hover {
          background-color: #ffffff;
          border-color: var(--primary-color);
        }

        .article-info {
          display: flex;
          flex-direction: column;
        }
        
        .article-title {
          font-weight: 500;
          margin-bottom: 8px;
          text-transform: capitalize;
          color: var(--text-color);
        }
        
        .metric-value {
          font-weight: 600;
        }
        
        .revenue-value {
          color: var(--primary-color);
        }
        
        .profit-positive {
          color: var(--success-color);
        }
        
        .profit-negative {
          color: var(--error-color);
        }
        
        .roi-value {
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 12px;
        }
        
        .roi-success {
          color: var(--success-color);
        }
        
        .roi-warning {
          color: var(--warning-color);
        }
        
        .roi-error {
          color: var(--error-color);
        }
        
        .roi-column-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .roi-progress {
          margin-right: 8px;
        }
        
        .detail-card {
          border-radius: var(--border-radius-sm);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
          border: none;
        }
        
        .detail-card-title {
          display: flex;
          align-items: center;
        }
        
        .detail-card-icon-wrapper {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 8px;
        }
        
        .detail-card-icon {
          font-size: 14px;
          color: white;
        }
        
        .url-icon {
          background: var(--secondary-gradient);
        }
        
        .url-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 12px;
        }
        
        .url-item {
          margin-bottom: 0;
          word-break: break-all;
          display: flex;
          align-items: center;
          background-color: #f9fafb;
          padding: 8px 12px;
          border-radius: 8px;
          transition: all 0.3s ease;
        }
        
        .url-item:hover {
          background-color: #f0f4ff;
        }
        
        .url-icon-small {
          margin-right: 8px;
          color: var(--secondary-color);
        }
        
        .performance-table .ant-table-thead > tr > th {
          background-color: #f0f2f5;
          font-weight: 600;
          text-align: center;
        }
        
        .performance-table .ant-table-thead > tr > th.ant-table-cell-fix-left {
          background-color: #f0f2f5;
        }
        
        /* Stick the article column to the left */
        .performance-table .ant-table-cell-fix-left {
          background: white;
          z-index: 2;
        }
        
        /* Table styles for better scrolling experience */
        .performance-table .ant-table-container {
          overflow-x: auto;
        }
        
        /* Add horizontal scroll notice */
        .performance-table::after {
          content: "Scroll horizontally to see more metrics →";
          display: block;
          text-align: center;
          padding: 8px;
          background-color: #f9f9f9;
          border-top: 1px solid #eee;
          font-size: 12px;
          color: #666;
        }
        
        .text-error {
          color: var(--error-color);
        }
        
        .text-success {
          color: var(--success-color);
        }
        
        .text-warning {
          color: var(--warning-color);
        }
        
        .expanded-row-content {
          padding: 16px;
        }

        /* Responsive styles */
        @media (max-width: 992px) {
          .search-input {
            width: 200px;
          }
        }
        
        @media (max-width: 768px) {
          .header-container {
            flex-direction: column;
            align-items: flex-start;
          }
          
          .header-actions {
            margin-top: 16px;
            width: 100%;
          }
          
          .search-container {
            width: 100%;
          }
          
          .search-input {
            width: 100%;
          }
        }
        
        .revenue-estimated-indicator {
          color: #ff9800;
          font-weight: bold;
          margin-left: 2px;
          font-size: 14px;
          vertical-align: super;
          cursor: help;
        }
        
        .country-breakdown-table {
          margin-top: 8px;
        }
        
        .country-code-display {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          text-transform: uppercase;
        }
        
        .country-icon {
          background: var(--primary-gradient);
        }
        
        /* Add styles for country breakdown table */
        .country-breakdown-table .ant-table-thead > tr > th {
          background-color: #f0f2f5;
          font-weight: 600;
          text-align: center;
          font-size: 12px;
          padding: 8px 4px;
        }
        
        .country-breakdown-table .ant-table-tbody > tr > td {
          padding: 8px 4px;
          font-size: 12px;
          text-align: center;
        }
        
        .country-breakdown-table .ant-table-cell-fix-left {
          background: white;
          z-index: 2;
        }
        
        .country-breakdown-table .ant-table-container {
          overflow-x: auto;
        }
        
        .country-flag {
          display: inline-block;
          margin-right: 6px;
          vertical-align: middle;
        }
        
        .country-code-display {
          display: flex;
          align-items: center;
          font-weight: 500;
        }
        
        .country-code-display strong {
          text-transform: uppercase;
          margin-left: 4px;
        }
        
        .country-tag {
          display: flex;
          align-items: center;
          padding: 2px 8px;
        }
        
        /* Fix flag sizing and alignment */
        .country-flag img, .country-flag-image {
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 2px;
          object-fit: cover;
          vertical-align: middle;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          margin-right: 4px;
        }
        
        /* Country breakdown table styling to match screenshot */
        .country-breakdown-table .country-code-display {
          display: flex;
          align-items: center;
          padding: 4px 0;
          justify-content: center;
        }
        
        .country-breakdown-table .country-code-display strong {
          font-weight: 600;
          font-size: 13px;
          color: #333;
        }
      `}</style>
    </div>
  );
};

export default DataTable; 