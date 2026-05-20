'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout, Typography, DatePicker, Button, Row, Col, Alert, Select, Input, Tooltip, Table, Card } from 'antd';
import { ReloadOutlined, SearchOutlined, AndroidOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { DashboardSkeleton, CacheIndicator } from '@/components/DashboardSkeleton';
import Flag from 'react-world-flags';

const { Content } = Layout;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const AA_ACCOUNTS = [
    { id: '8701280199', name: 'androidadvices 01 (8701280199)', descriptiveName: 'androidadvices 01 — 8701280199' },
    { id: '3765399744', name: 'androidadvices 02 (3765399744)', descriptiveName: 'androidadvices 02 — 3765399744' },
    { id: '3617356950', name: 'androidadvices 03 (3617356950)', descriptiveName: 'androidadvices 03 — 3617356950' },
    { id: '4932880256', name: 'androidadvices 04 (4932880256)', descriptiveName: 'androidadvices 04 — 4932880256' },
    { id: '3764963776', name: 'androidadvices 05 (3764963776)', descriptiveName: 'androidadvices 05 — 3764963776' },
    { id: '4702286319', name: 'androidadvices 06 (4702286319)', descriptiveName: 'androidadvices 06 — 4702286319' },
    { id: '8182947427', name: 'androidadvices 07 (8182947427)', descriptiveName: 'androidadvices 07 — 8182947427' },
    { id: '7423206633', name: 'androidadvices 08 (7423206633)', descriptiveName: 'androidadvices 08 — 7423206633' },
    { id: '7753453760', name: 'androidadvice 09 (7753453760)', descriptiveName: 'androidadvice 09 — 7753453760' },
    { id: '9785664835', name: 'androidadvices 10 (9785664835)', descriptiveName: 'androidadvices 10 — 9785664835' },
    { id: '5418244007', name: 'androidadvices 11 (5418244007)', descriptiveName: 'androidadvices 11 — 5418244007' },
    { id: '1223790856', name: 'androidadvices 12 (1223790856)', descriptiveName: 'androidadvices 12 — 1223790856' },
    { id: '7416756000', name: 'androidadvices 13 (7416756000)', descriptiveName: 'androidadvices 13 — 7416756000' },
];

const AA_PUBLISHER_DISPLAY_NAME = 'AndroidAdvice';
const CACHE_PREFIX = 'aa_data_';
const CACHE_TTL_MS = 5 * 60 * 1000;

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

export default function AndroidAdvicePage() {
    const [loading, setLoading] = useState(false);
    const [loadingForce, setLoadingForce] = useState(false);
    const [data, setData] = useState<AdSenseCostRevenueResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedAccount, setSelectedAccount] = useState<string>('all');
    const [isAdmin, setIsAdmin] = useState(false);
    const [isFromCache, setIsFromCache] = useState(false);
    const [cacheAge, setCacheAge] = useState<number | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs()]);
    const [searchText, setSearchText] = useState<string>('');
    const [sortBy, setSortBy] = useState<string>('cost');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(20);

    const getCacheKey = useCallback((account: string, dates: [Dayjs, Dayjs]) => {
        return `${CACHE_PREFIX}${account}:${dates[0].format('YYYY-MM-DD')}:${dates[1].format('YYYY-MM-DD')}`;
    }, []);

    const loadCachedData = useCallback((account: string, dates: [Dayjs, Dayjs]): AdSenseCostRevenueResponse | null => {
        if (typeof window === 'undefined') return null;
        try {
            const cached = localStorage.getItem(getCacheKey(account, dates));
            if (!cached) return null;
            const { data, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            if (age > CACHE_TTL_MS) return null;
            setCacheAge(Math.round(age / 1000));
            return data;
        } catch { return null; }
    }, [getCacheKey]);

    const saveCacheData = useCallback((account: string, dates: [Dayjs, Dayjs], data: AdSenseCostRevenueResponse) => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(getCacheKey(account, dates), JSON.stringify({ data, timestamp: Date.now() }));
        } catch { }
    }, [getCacheKey]);

    const getCookie = (name: string): string | null => {
        if (typeof document === 'undefined') return null;
        const cookieValue = document.cookie.split('; ').find(row => row.startsWith(name + '='));
        return cookieValue ? cookieValue.split('=')[1] : null;
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchText, sortBy, sortOrder, pageSize]);

    const isFirstMount = useRef(true);

    useEffect(() => {
        const authType = getCookie('auth_type');
        const accountIdCookie = getCookie('account_id');
        const isAdminUser = authType === 'admin';

        setIsAdmin(isAdminUser);

        if (!isAdminUser && accountIdCookie) {
            const numericAccountId = accountIdCookie.replace('CID_', '');
            const isValidAccount = AA_ACCOUNTS.some(acc => acc.id === numericAccountId);
            if (isValidAccount) {
                setSelectedAccount(numericAccountId);
            } else {
                setError(`Invalid account ID: ${numericAccountId} is not an AndroidAdvice account`);
            }
        }

        const cached = loadCachedData(selectedAccount, dateRange);
        if (cached) {
            setData(cached);
            setIsFromCache(true);
            setIsRefreshing(true);
        }
    }, []);

    useEffect(() => {
        if (isFirstMount.current) {
            fetchData(false, selectedAccount);
            isFirstMount.current = false;
        } else {
            const cached = loadCachedData(selectedAccount, dateRange);
            if (cached) {
                setData(cached);
                setIsFromCache(true);
                setIsRefreshing(true);
            } else {
                setData(null);
            }
            fetchData(false, selectedAccount);
        }
    }, [selectedAccount, dateRange]);

    const fetchData = async (forceLive = false, accountOverride?: string) => {
        const account = accountOverride ?? selectedAccount;

        if (forceLive) setLoadingForce(true);
        else setLoading(true);
        setError(null);

        try {
            // Publisher ID is resolved server-side from ANDROIDADVICE_PUBLISHER_ID env;
            // client never sends one for androidadvice to avoid cross-feed mixups.
            const requestBody: any = {
                startDate: dateRange[0].format('YYYY-MM-DD'),
                endDate: dateRange[1].format('YYYY-MM-DD'),
                adsenseAccountType: 'androidadvice',
                forceLive,
            };

            if (account === 'all') {
                requestBody.accountIds = AA_ACCOUNTS.map(a => a.id);
            } else {
                requestBody.accountIds = [account];
            }

            const response = await fetch('/api/adsense-cost-revenue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || result.message || 'Failed to fetch data');

            setData(result);
            saveCacheData(account, dateRange, result);
            setIsFromCache(false);
            setIsRefreshing(false);
            setCacheAge(0);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch AndroidAdvice data');
            setIsRefreshing(false);
        } finally {
            setLoading(false);
            setLoadingForce(false);
        }
    };

    const getFilteredCampaigns = () => {
        if (!data?.campaign_aggregated) return [];
        let filtered = data.campaign_aggregated;

        if (searchText) {
            filtered = filtered.filter((c: any) =>
                c.campaign_name?.toLowerCase().includes(searchText.toLowerCase()) ||
                c.style_id?.toLowerCase().includes(searchText.toLowerCase()) ||
                c.country?.toLowerCase().includes(searchText.toLowerCase())
            );
        }

        filtered.sort((a: any, b: any) => {
            const av = a[sortBy] || 0;
            const bv = b[sortBy] || 0;
            return sortOrder === 'asc' ? av - bv : bv - av;
        });

        return filtered;
    };

    const getPaginatedCampaigns = () => {
        const filtered = getFilteredCampaigns();
        const start = (currentPage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    };

    const getTotalPages = () => Math.ceil(getFilteredCampaigns().length / pageSize);

    const getFilteredSummary = () => {
        const campaigns = getFilteredCampaigns();
        return {
            totalCost: campaigns.reduce((s: number, c: any) => s + (c.cost || 0), 0),
            totalRevenue: campaigns.reduce((s: number, c: any) => s + (c.revenue || 0), 0),
            totalProfit: campaigns.reduce((s: number, c: any) => s + (c.profit || 0), 0),
        };
    };

    const filteredSummary = getFilteredSummary();
    const filteredCampaigns = getFilteredCampaigns();
    const paginatedCampaigns = getPaginatedCampaigns();
    const totalPages = getTotalPages();

    return (
        <DashboardLayout>
            <Content style={{ padding: '24px', background: '#f0f2f5' }}>
                <div style={{ maxWidth: 1600, margin: '0 auto' }}>

                    {/* Header */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        <Col span={24}>
                            <div style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Title level={3} style={{ margin: 0 }}>
                                        <AndroidOutlined /> AndroidAdvice
                                    </Title>
                                    <CacheIndicator isFromCache={isFromCache} isRefreshing={isRefreshing || loading || loadingForce} cacheAge={cacheAge} />
                                </div>
                            </div>
                        </Col>
                    </Row>

                    {/* Controls */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                        <Col xs={24} md={8}>
                            <div>
                                <Text strong>Google Ads Account</Text>
                                <Select
                                    style={{ width: '100%', marginTop: 8 }}
                                    value={selectedAccount}
                                    onChange={setSelectedAccount}
                                    disabled={!isAdmin}
                                >
                                    <Option value="all">All AndroidAdvice Accounts</Option>
                                    {AA_ACCOUNTS.map(acc => (
                                        <Option key={acc.id} value={acc.id}>{acc.name}</Option>
                                    ))}
                                </Select>
                            </div>
                        </Col>
                        <Col xs={24} md={8}>
                            <div>
                                <Text strong>AdSense Account</Text>
                                <div style={{
                                    marginTop: 8, padding: '8px 12px', border: '1px solid #d9d9d9',
                                    borderRadius: '6px', background: '#fafafa', color: '#666', fontSize: 14
                                }}>
                                    {AA_PUBLISHER_DISPLAY_NAME}
                                </div>
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

                    {/* Action Buttons */}
                    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                        <Col span={24}>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                <Button
                                    type="primary"
                                    icon={<ReloadOutlined />}
                                    onClick={() => fetchData(false)}
                                    loading={loading}
                                    disabled={loadingForce}
                                >
                                    Fetch Data
                                </Button>
                                <Button
                                    type="default"
                                    icon={<ReloadOutlined />}
                                    onClick={() => fetchData(true)}
                                    loading={loadingForce}
                                    disabled={loading}
                                    danger
                                >
                                    Force Refresh
                                </Button>
                            </div>
                        </Col>
                    </Row>

                    {error && !data && (
                        <Alert message="Error" description={error} type="error" showIcon style={{ marginBottom: 24 }} />
                    )}

                    {(loading || loadingForce) && !data && <DashboardSkeleton />}

                    {data && (() => (
                        <Row gutter={[16, 16]}>
                            {/* Summary Cards */}
                            <Col span={24}>
                                <div style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
                                    <Row gutter={[16, 16]}>
                                        {[
                                            { label: 'Total Cost', value: `$${filteredSummary.totalCost.toFixed(2)}`, color: '#f5222d' },
                                            { label: 'Total Revenue', value: `$${filteredSummary.totalRevenue.toFixed(2)}`, color: '#52c41a' },
                                            { label: 'Total Profit', value: `$${filteredSummary.totalProfit.toFixed(2)}`, color: filteredSummary.totalProfit >= 0 ? '#52c41a' : '#f5222d' },
                                            { label: 'ROI', value: `${(filteredSummary.totalCost > 0 ? (filteredSummary.totalProfit / filteredSummary.totalCost) * 100 : 0).toFixed(2)}%`, color: filteredSummary.totalProfit >= 0 ? '#52c41a' : '#f5222d' },
                                        ].map(({ label, value, color }) => (
                                            <Col xs={12} md={6} key={label}>
                                                <div>
                                                    <Text type="secondary">{label}</Text>
                                                    <div style={{ fontSize: 24, fontWeight: 'bold', color }}>{value}</div>
                                                </div>
                                            </Col>
                                        ))}
                                    </Row>
                                </div>
                            </Col>

                            {/* Account-Level Table for All Accounts view */}
                            {selectedAccount === 'all' && data.account_level_aggregated?.length > 0 && (
                                <Col span={24}>
                                    <Card title={<Title level={4}>Account-Level Performance</Title>}>
                                        <Table
                                            columns={[
                                                { title: 'Account', dataIndex: 'account_id', key: 'account_id', render: (id: string) => <Text strong>{AA_ACCOUNTS.find(a => a.id === id)?.name || id}</Text> },
                                                { title: 'Campaigns', dataIndex: 'campaignCount', key: 'campaignCount' },
                                                { title: 'Cost', dataIndex: 'cost', key: 'cost', render: (v: number) => <Text style={{ color: '#ff4d4f' }}>${(v || 0).toFixed(2)}</Text>, sorter: (a: any, b: any) => a.cost - b.cost },
                                                { title: 'Revenue', dataIndex: 'revenue', key: 'revenue', render: (v: number) => <Text style={{ color: '#52c41a' }}>${(v || 0).toFixed(2)}</Text>, sorter: (a: any, b: any) => a.revenue - b.revenue },
                                                { title: 'Profit', dataIndex: 'profit', key: 'profit', render: (v: number) => <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>${(v || 0).toFixed(2)}</Text>, sorter: (a: any, b: any) => a.profit - b.profit },
                                                { title: 'ROI', dataIndex: 'roi', key: 'roi', render: (v: number) => <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>{(v || 0).toFixed(1)}%</Text>, sorter: (a: any, b: any) => a.roi - b.roi },
                                                { title: 'Conversions', dataIndex: 'conversions', key: 'conversions', render: (v: number) => Math.round(v || 0).toLocaleString() },
                                            ]}
                                            dataSource={data.account_level_aggregated}
                                            rowKey="account_id"
                                            pagination={false}
                                            size="middle"
                                            scroll={{ x: 800 }}
                                        />
                                    </Card>
                                </Col>
                            )}

                            {/* Campaign Table */}
                            <Col span={24}>
                                <div style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
                                    {/* Filters */}
                                    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                                        <Col xs={24} md={8}>
                                            <Text strong>Search Campaign, Style ID or Country</Text>
                                            <Input
                                                placeholder="Search by Campaign Name, Style ID, or Country"
                                                value={searchText}
                                                onChange={(e) => setSearchText(e.target.value)}
                                                prefix={<SearchOutlined />}
                                                allowClear
                                                style={{ marginTop: 8 }}
                                            />
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Text strong>Sort By</Text>
                                            <Select style={{ width: '100%', marginTop: 8 }} value={sortBy} onChange={setSortBy}>
                                                <Option value="cost">Cost</Option>
                                                <Option value="revenue">Revenue</Option>
                                                <Option value="profit">Profit</Option>
                                                <Option value="roi">ROI</Option>
                                                <Option value="conversions">Conversions</Option>
                                                <Option value="clicks">Clicks</Option>
                                                <Option value="cpa">CPA</Option>
                                            </Select>
                                        </Col>
                                        <Col xs={24} md={8}>
                                            <Text strong>Sort Order</Text>
                                            <Select style={{ width: '100%', marginTop: 8 }} value={sortOrder} onChange={setSortOrder}>
                                                <Option value="desc">Highest First</Option>
                                                <Option value="asc">Lowest First</Option>
                                            </Select>
                                        </Col>
                                    </Row>

                                    {filteredCampaigns.length === 0 ? (
                                        <Alert message="No Data" description="No campaigns found for AndroidAdvice." type="info" showIcon />
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <style dangerouslySetInnerHTML={{
                                                __html: `
                        .aa-table { width: 100%; border-collapse: collapse; font-size: 14px; }
                        .aa-table thead tr:first-child th { padding: 12px; font-weight: 800; font-size: 14px; border: 3px solid #fff; }
                        .aa-table thead tr:nth-child(2) th { padding: 8px; font-weight: 600; font-size: 12px; background: #fafafa; border: 1px solid #f0f0f0; }
                        .aa-table tbody tr { transition: all 0.3s; }
                        .aa-table tbody tr:hover { background: #f0f7ff !important; transform: translateY(-3px); box-shadow: 0 6px 20px rgba(24,144,255,0.1); }
                        .aa-table tbody td { padding: 12px; border-bottom: 1px solid #f0f0f0; }
                        .aa-name-cell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: #1f2937; }
                        `
                                            }} />
                                            <table className="aa-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{ textAlign: 'left', background: 'linear-gradient(135deg,#f1f5f9,#e2e8f0)', color: '#1e293b', padding: '12px', borderRadius: '8px', fontWeight: 600 }}>Campaign</th>
                                                        <th style={{ textAlign: 'center', background: 'linear-gradient(135deg,#e0f2fe,#bae6fd)', color: '#075985', padding: '12px', borderRadius: '8px', fontWeight: 600 }}>Style ID</th>
                                                        <th style={{ textAlign: 'center', background: 'linear-gradient(135deg,#fef3c7,#fde68a)', color: '#92400e', padding: '12px', borderRadius: '8px', fontWeight: 600 }}>Country</th>
                                                        <th colSpan={3} style={{ textAlign: 'center', background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)', color: '#1e40af', padding: '12px', borderRadius: '8px', fontWeight: 600 }}>Google Ads</th>
                                                        <th colSpan={3} style={{ textAlign: 'center', background: 'linear-gradient(135deg,#d1fae5,#a7f3d0)', color: '#065f46', padding: '12px', borderRadius: '8px', fontWeight: 600 }}>AdSense</th>
                                                        <th colSpan={2} style={{ textAlign: 'center', background: 'linear-gradient(135deg,#e9d5ff,#d8b4fe)', color: '#6b21a8', padding: '12px', borderRadius: '8px', fontWeight: 600 }}>Performance</th>
                                                    </tr>
                                                    <tr style={{ background: '#fafafa' }}>
                                                        <th style={{ textAlign: 'left' }}></th>
                                                        <th style={{ textAlign: 'center', fontSize: 12 }}>ID</th>
                                                        <th style={{ textAlign: 'center', fontSize: 12 }}>Flag</th>
                                                        <th style={{ textAlign: 'right', fontSize: 12 }}>Cost</th>
                                                        <th style={{ textAlign: 'right', fontSize: 12 }}>CPA</th>
                                                        <th style={{ textAlign: 'right', fontSize: 12 }}>Conv.</th>
                                                        <th style={{ textAlign: 'right', fontSize: 12 }}>Revenue</th>
                                                        <th style={{ textAlign: 'right', fontSize: 12 }}>Clicks</th>
                                                        <th style={{ textAlign: 'right', fontSize: 12 }}>RPC</th>
                                                        <th style={{ textAlign: 'right', fontSize: 12 }}>Profit</th>
                                                        <th style={{ textAlign: 'right', fontSize: 12 }}>ROI</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {paginatedCampaigns.map((campaign: any, idx: number) => (
                                                        <tr key={idx}>
                                                            <td className="aa-name-cell">
                                                                <Tooltip title={campaign.campaign_name || 'N/A'} placement="topLeft">
                                                                    {campaign.campaign_name || 'N/A'}
                                                                </Tooltip>
                                                            </td>
                                                            <td style={{ textAlign: 'center', color: '#075985', fontWeight: 500, fontSize: 12 }}>
                                                                {campaign.style_id || '—'}
                                                            </td>
                                                            <td style={{ textAlign: 'center', textTransform: 'capitalize', color: '#92400e', fontWeight: 500 }}>
                                                                {campaign.country && campaign.country !== 'N/A' && campaign.country !== 'unknown' ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                                        <Flag code={campaign.country.toUpperCase()} height="14" style={{ borderRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                                                                        <span>{campaign.country.toUpperCase()}</span>
                                                                    </div>
                                                                ) : '—'}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: '#ff4d4f', fontWeight: 500 }}>${campaign.cost?.toFixed(2) || '0.00'}</td>
                                                            <td style={{ textAlign: 'right' }}>${campaign.cpa?.toFixed(2) || '0.00'}</td>
                                                            <td style={{ textAlign: 'right', color: '#722ed1', fontWeight: 500 }}>{campaign.conversions?.toFixed(0) || '0'}</td>
                                                            <td style={{ textAlign: 'right', color: '#52c41a', fontWeight: 600 }}>${campaign.revenue?.toFixed(2) || '0.00'}</td>
                                                            <td style={{ textAlign: 'right', color: '#1890ff', fontWeight: 500 }}>{campaign.clicks?.toLocaleString() || '0'}</td>
                                                            <td style={{ textAlign: 'right', color: '#fa8c16', fontWeight: 500 }}>${campaign.rpc?.toFixed(4) || '0.0000'}</td>
                                                            <td style={{ textAlign: 'right', color: campaign.profit >= 0 ? '#52c41a' : '#f5222d', fontWeight: 600 }}>${campaign.profit?.toFixed(2) || '0.00'}</td>
                                                            <td style={{ textAlign: 'right', color: campaign.roi >= 0 ? '#52c41a' : '#f5222d', fontWeight: 600 }}>{campaign.roi?.toFixed(2) || '0.00'}%</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>

                                            {/* Pagination */}
                                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text type="secondary">
                                                    Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredCampaigns.length)} of {filteredCampaigns.length}
                                                </Text>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <Text type="secondary">Rows:</Text>
                                                    <Select value={pageSize} onChange={setPageSize} style={{ width: 80 }}>
                                                        {[10, 20, 50, 100].map(n => <Option key={n} value={n}>{n}</Option>)}
                                                    </Select>
                                                    <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
                                                    <Text>Page {currentPage} of {totalPages}</Text>
                                                    <Button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Col>
                        </Row>
                    ))()}
                </div>
            </Content>
        </DashboardLayout>
    );
}
