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
  FallOutlined,
  FileTextOutlined,
  PlusCircleOutlined
} from '@ant-design/icons';
import { AdsComArticleData, AdsComCountryData } from '../../lib/adscom-api';
import { GoogleAdsAd } from '../../lib/google-ads-api';
import Flag from 'react-world-flags';
import { useNotes } from '../Providers/NotesProvider';
import NoteModal from '../Notes/NoteModal';

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
  notes?: string; // Added for notes column
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
  const { notesMap, saveNote, deleteNote } = useNotes();
  const [noteModalVisible, setNoteModalVisible] = useState<boolean>(false);
  const [currentSlug, setCurrentSlug] = useState<string>('');

  const openNoteModal = (slug: string) => {
    setCurrentSlug(slug);
    setNoteModalVisible(true);
  };

  const handleSaveNote = async (text: string) => {
    await saveNote(currentSlug, text);
    setNoteModalVisible(false);
  };

  const handleDeleteNote = async () => {
    await deleteNote(currentSlug);
    setNoteModalVisible(false);
  };

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
    
    // If the slug contains a domain, extract only the article part after the domain
    let titleSlug = slug;
    if (slug.includes('/')) {
      // Split by '/' and remove the domain part (first element)
      const parts = slug.split('/');
      // Get all parts after the domain
      titleSlug = parts.slice(1).join('/');
    }
    
    return titleSlug
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

  // Helper to ensure numeric sort consistency
  const numericSort = (getter: (row: CombinedRowData) => number) => {
    return (a: CombinedRowData, b: CombinedRowData) => {
      const aVal = getter(a);
      const bVal = getter(b);
      return aVal - bVal;
    };
  };

  // Helper to recursively inject default sortDirections so every sortable column toggles consistently
  const addSortDirections = (cols: any[]): any[] =>
    cols.map(col => {
      const newCol = { ...col };
      if (newCol.children) {
        newCol.children = addSortDirections(newCol.children);
      }
      if (newCol.sorter) {
        if (!newCol.sortDirections) newCol.sortDirections = ['ascend', 'descend'];
      }
      return newCol;
    });

  // Define table columns
  const baseColumns = [
    {
      title: 'Article',
      dataIndex: 'article',
      key: 'article',
      className: 'article-column',
      render: (text: string, record: CombinedRowData) => {
        const fullTitle = formatArticleTitle(record.article);
        const truncated = fullTitle.split(' ').slice(0, 3).join(' ');

        return (
          <div className="article-info">
            <Tooltip title={fullTitle} placement="topLeft">
              <div className="article-title truncated-title">
                {truncated}{fullTitle.split(' ').length > 3 ? '...' : ''}
              </div>
            </Tooltip>
            {/* Country buttons removed from main view as per user request */}
          </div>
        );
      },
      width: '20%',
      align: 'left' as const,
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
          width: '6%',
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
          width: '6%',
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
            const cpc = Number(record.cpc || 0);
            return `$${safeFormat.currency(cpc, 2)}`;
          },
          width: '5%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => (a.cpc || 0) - (b.cpc || 0),
        },
        {
          title: 'CPA',
          dataIndex: 'cpa',
          key: 'cpa',
          render: (value: number, record: CombinedRowData) => {
            const cpa = record.apiMetrics?.cpa ?? (record.conversions && record.conversions > 0 ? record.cost / record.conversions : 0);
            return `$${safeFormat.currency(cpa, 2)}`;
          },
          width: '5%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => {
            const aCpa = a.apiMetrics?.cpa ?? ((a.conversions || 0) > 0 ? (a.cost || 0) / (a.conversions || 1) : 0);
            const bCpa = b.apiMetrics?.cpa ?? ((b.conversions || 0) > 0 ? (b.cost || 0) / (b.conversions || 1) : 0);
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
          width: '5%',
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
          width: '5%',
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
          width: '5%',
          sorter: (a: any, b: any) => a.visits - b.visits,
          defaultSortOrder: 'descend' as const,
        },
        {
          title: 'CTR',
          dataIndex: 'ctr',
          key: 'ctr',
          render: (value: number) => safeFormat.percentage(value),
          width: '5%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.ctr - b.ctr,
        },
        {
          title: 'EPC',
          dataIndex: 'epc',
          key: 'epc',
          render: (value: number) => `$${safeFormat.currency(value, 4)}`,
          width: '5%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.epc - b.epc,
        },
        {
          title: 'Clicks',
          dataIndex: 'clicks',
          key: 'clicks',
          render: (value: number) => safeFormat.number(value),
          width: '5%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.clicks - b.clicks,
        },
        {
          title: 'Revenue',
          dataIndex: 'revenue',
          key: 'revenue',
          render: (value: number, record: CombinedRowData) => formatRevenueDisplay(value, record.finalized),
          width: '5%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.revenue - b.revenue,
        },
        {
          title: 'Profit',
          dataIndex: 'profit',
          key: 'profit',
          render: (value: number) => (
            <div className={`metric-value ${value >= 0 ? 'profit-positive' : 'profit-negative'}`}>
              ${safeFormat.currency(value, 2)}
            </div>
          ),
          width: '5%',
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
          width: '5%',
          sorter: (a: CombinedRowData, b: CombinedRowData) => a.roi - b.roi,
        },
        {
          title: 'Notes',
          dataIndex: 'notes',
          key: 'notes',
          width: '5%',
          render: (_: any, record: CombinedRowData) => {
            const note = notesMap[record.slug];
            return (
              <Tooltip 
                title={note ? <div style={{ whiteSpace: 'pre-line' }}>{note.text}</div> : 'Add note'}
                overlayStyle={{ maxWidth: '400px' }}
              >
                <span
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openNoteModal(record.slug);
                  }}
                >
                  {note ? (
                    <FileTextOutlined style={{ color: '#4f46e5' }} />
                  ) : (
                    <PlusCircleOutlined style={{ color: '#9ca3af' }} />
                  )}
                </span>
              </Tooltip>
            );
          },
        },
      ],
    }
  ];

  const columns = addSortDirections(baseColumns);

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
        notes: notesMap[slug]?.text || '', // Initialize notes
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
            
          // Calculate CPC using formula: total cost / total ad clicks
          if (targetRow.costClicks > 0) {
            targetRow.cpc = targetRow.cost / targetRow.costClicks;
          } else {
            targetRow.cpc = 0;
          }
            
          targetRow.cost += cost;
          targetRow.conversions = (targetRow.conversions || 0) + conversions;
          targetRow.profit = targetRow.revenue - targetRow.cost;
          
          // Calculate CPA using formula: total cost / total conversions
          if (targetRow.conversions > 0) {
            if (!targetRow.apiMetrics) targetRow.apiMetrics = { conversionRate: apiConversionRate, cpa: 0 };
            targetRow.apiMetrics.cpa = targetRow.cost / targetRow.conversions;
          } else if (targetRow.apiMetrics) {
            targetRow.apiMetrics.cpa = 0;
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
          targetRow.notes = notesMap[targetRow.slug]?.text || ''; // Update notes
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
                },
                notes: '', // No notes for new rows
              };
              combined.push(newRow);
            }
          });
        }
      });
    });
    
    // Filter out any remaining Taboola data (as a fallback)
    const filteredCombined = combined.filter(row => {
      // Check if any URL contains "taboola"
      const hasTaboolaUrl = row.finalUrls.some(url => 
        url.toLowerCase().includes('taboola')
      );
      
      // Check if article name contains "taboola"
      const hasTaboolaName = row.article.toLowerCase().includes('taboola');
      
      // Keep only rows that don't have Taboola in URLs or article name
      return !hasTaboolaUrl && !hasTaboolaName;
    });

    // Sort by profit (highest first)
    return filteredCombined.sort((a, b) => b.profit - a.profit);
  }, [revenueData, costData, notesMap]);

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
            <span>Country Breakdown {record.country && renderCountryWithFlag(record.country)}</span>
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
                        ${safeFormat.currency(value, 2)}
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
            rowClassName={() => 'country-row-3d'}
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
        columns={columns}
        dataSource={filteredData}
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
            setCurrentPage(1);
          }
        }}
        onChange={(pagination, filters, sorter: any) => {
          setSortedInfo({ columnKey: sorter.columnKey, order: sorter.order });
        }}
        size="small"
        bordered
        className="performance-table"
        rowClassName={() => 'performance-row-3d'}
        expandable={{ expandedRowRender, expandedRowKeys: expandedItems, onExpand: (expanded, record) => toggleExpand(record.key) }}
      />
      <NoteModal
        open={noteModalVisible}
        slug={currentSlug}
        initialText={notesMap[currentSlug]?.text || ''}
        onSave={handleSaveNote}
        onDelete={notesMap[currentSlug] ? handleDeleteNote : undefined}
        onCancel={() => setNoteModalVisible(false)}
      />
      
      <style jsx global>{`
        .data-table-container {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          padding: 20px;
          margin-bottom: 24px;
          overflow: visible;
          width: 100%;
        }
        
        /* Make expand button more visible */
        .ant-table-row-expand-icon {
          background-color: #f0f2ff;
          border-color: #6366f1;
          color: #6366f1;
          transition: all 0.3s;
          transform: scale(1.1);
          margin-right: 8px;
        }
        
        .ant-table-row-expand-icon:hover {
          background-color: #e6e8ff;
          box-shadow: 0 0 5px rgba(99, 102, 241, 0.3);
        }
        
        /* Tooltip styling */
        .ant-tooltip {
          max-width: 400px;
        }
        
        .ant-tooltip-inner {
          padding: 8px 12px;
          font-size: 14px;
          line-height: 1.5;
          border-radius: 4px;
          box-shadow: 0 3px 6px -4px rgba(0,0,0,0.12), 0 6px 16px 0 rgba(0,0,0,0.08);
          white-space: pre-line;
          text-align: left;
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
          animation: floatTableIcon 2s ease-in-out infinite alternate;
        }
        
        @keyframes floatTableIcon {
          0% { transform: translateY(0); }
          100% { transform: translateY(-5px); }
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
          justify-content: center;
          height: 100%;
          padding: 2px 0;
        }
        
        .article-title {
          font-weight: 500;
          color: #1f2937;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
          max-width: 100%;
          padding-right: 8px;
          display: flex;
          align-items: center;
          height: 20px;
          text-align: left;
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
          font-size: 14px;
          font-weight: 500;
          justify-content: flex-start;
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
          justify-content: center;
          height: 100%;
          font-size: 14px;
        }
        
        /* Fix alignment for all numeric cells */
        .ant-table-cell-fix-left + td, 
        .ant-table-cell-fix-left + td ~ td {
          text-align: center;
        }
        
        /* Left align the article column */
        .article-column {
          text-align: left !important;
        }
        
        /* Consistent number formatting */
        .ant-table-cell .anticon {
          margin-left: 4px;
        }
        
        .ant-table-thead > tr > th {
          font-weight: 600;
          background: #f3f4f6;
          cursor: pointer;
          transition: all 0.2s;
          padding: 4px 6px;
          height: 32px;
          font-size: 14px;
          text-align: center;
        }
        
        .ant-table-thead > tr > th:hover {
          background-color: #f0f5ff !important;
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
          font-size: 14px;
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
          padding: 6px 0;
          margin-top: -1px;
          background-color: #f9fafb;
        }
        
        .detail-card {
          margin-bottom: 8px;
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
          margin-right: 8px;
          border: 1px solid rgba(0,0,0,0.05);
          border-radius: 2px;
        }
        
        /* Country breakdown table styling */
        .ant-table {
          font-size: 14px;
          border-spacing: 0;
        }
        
        .ant-table table {
          border-collapse: collapse;
        }
        
        /* Important rule to override default Ant Design table spacing */
        .ant-table-tbody > tr > td, .ant-table-thead > tr > th {
          border-bottom-width: 1px !important;
        }
        
        /* Improve table alignment */
        .ant-table-cell {
          vertical-align: middle !important;
          text-align: center;
          height: 30px;
          padding: 0px 6px;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .ant-table-cell:first-child {
          text-align: left;
          padding-left: 8px;
        }
        
        .article-column {
          width: 200px;
          min-width: 200px;
          max-width: 240px;
        }
        
        .ant-table-row {
          height: 30px;
          line-height: 1.2;
        }
        
        /* Fix spacing between rows */
        .ant-table-tbody > tr {
          margin: 0;
          padding: 0;
        }
        
        /* Remove extra space in expanded rows */
        .ant-table-expanded-row > td {
          padding: 0 !important;
        }
        
        .ant-table-tbody > tr > td {
          font-size: 14px;
          padding: 0px 6px;
          text-align: center;
          margin: 0;
        }
        
        .ant-table-column-sorter {
          color: #4f46e5;
        }
        
        .ant-table-column-sort {
          background-color: #f0f5ff;
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
        
        /* Performance table specific styles */
        .performance-table .ant-table-thead > tr > th {
          padding: 4px 6px;
        }
        
        .performance-table .ant-table-tbody > tr > td {
          padding: 0px 6px;
        }
        
        .performance-table .ant-table-cell {
          white-space: normal;
        }
        
        .performance-table .article-column .ant-table-cell {
          white-space: normal;
        }
        
        /* Fix for article column display */
        .article-column {
          overflow: visible;
        }
        
        .truncated-title {
          text-overflow: ellipsis;
          white-space: nowrap;
          overflow: hidden;
          max-width: 220px;
        }
        
        /* Override any scrolling behavior */
        .ant-table-body {
          overflow: visible !important;
        }
        
        .ant-table-container {
          overflow: visible !important;
        }
        
        .ant-table {
          overflow: visible !important;
          width: 100% !important;
        }
        
        .ant-table-content {
          overflow: visible !important;
        }
        
        .ant-table-wrapper {
          overflow: visible !important;
        }
        
        /* Fix table layout to prevent horizontal scrolling */
        .performance-table table {
          table-layout: fixed;
          width: 100%;
        }
        
        /* 3D lift effect for article table rows */
        .performance-table .ant-table-tbody > tr.performance-row-3d {
          transition: box-shadow 0.3s cubic-bezier(0.4,0,0.2,1), transform 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        .performance-table .ant-table-tbody > tr.performance-row-3d:hover {
          box-shadow: 0 8px 24px rgba(99,102,241,0.12), 0 2px 8px rgba(0,0,0,0.08);
          transform: translateY(-4px) scale(1.01) perspective(600px) rotateX(1deg) rotateY(-1deg);
          z-index: 2;
          background: #f5f7ff !important;
        }
        
        /* 3D lift effect for country breakdown table rows */
        .detail-card .ant-table-tbody > tr.country-row-3d {
          transition: box-shadow 0.3s cubic-bezier(0.4,0,0.2,1), transform 0.3s cubic-bezier(0.4,0,0.2,1);
        }
        .detail-card .ant-table-tbody > tr.country-row-3d:hover {
          box-shadow: 0 8px 24px rgba(99,102,241,0.12), 0 2px 8px rgba(0,0,0,0.08);
          transform: translateY(-4px) scale(1.01) perspective(600px) rotateX(1deg) rotateY(-1deg);
          z-index: 2;
          background: #f5f7ff !important;
        }
      `}</style>
    </div>
  );
};

export default DataTable; 