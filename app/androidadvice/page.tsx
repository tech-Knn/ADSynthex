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
    { id: '7753453760', name: 'androidadvice 09  (7753453760)', descriptiveName: 'androidadvices 09 — 7753453760' },
    { id: '9785664835', name: 'androidadvices 10 (9785664835)', descriptiveName: 'androidadvices 10 — 9785664835' },
    { id: '5418244007', name: 'androidadvices 11 (5418244007)', descriptiveName: 'androidadvices 11 — 5418244007' },
    { id: '1223790856', name: 'androidadvices 12 (1223790856)', descriptiveName: 'androidadvices 12 — 1223790856' },
    { id: '7416756000', name: 'androidadvices 13 (7416756000)', descriptiveName: 'androidadvices 13 — 7416756000' },
    { id: '2039691127', name: 'androidadvices 14 (2039691127)', descriptiveName: 'androidadvices 14 — 2039691127' },
    { id: '5193468964', name: 'androidadvices 15 (5193468964)', descriptiveName: 'androidadvices 15 — 5193468964' },
    { id: '4457984442', name: 'androidadvices 16 (4457984442)', descriptiveName: 'androidadvices 16 — 4457984442' },
    { id: '9220539746', name: 'androidadvices 17 (9220539746)', descriptiveName: 'androidadvices 17 — 9220539746' },
    { id: '8693469647', name: 'androidadvices 18 (8693469647)', descriptiveName: 'androidadvices 18 — 8693469647' },
    { id: '9722524142', name: 'androidadvices 19 (9722524142)', descriptiveName: 'androidadvices 19 — 9722524142' },
];

const AA_PUBLISHER_DISPLAY_NAME = 'AndroidAdvice';
const CACHE_PREFIX = 'aa_data_';
const CACHE_TTL_MS = 5 * 60 * 1000;
// Background auto-refresh every 5 min. The server-side Redis cache is warmed
// every 12 min by androidadvice-cache-warmer cron, so most polls resolve in
// ~350ms and cost nothing. Removes the need for a manual Force Refresh button.
const AUTO_REFRESH_MS = 5 * 60 * 1000;

interface AdSenseCostRevenueResponse {
    google_ads_data: any;
    adsense_data: any;
    cost_revenue_mapping: any[];
    campaign_aggregated: any[];
    account_level_aggregated: any[];
    summary: any;
    data_quality?: {
        partial: boolean;
        total_accounts_requested: number;
        failed_account_ids: string[];
        partial_cost_account_ids: string[];
    };
    _source: string;
    _timestamp: string;
    _message: string;
}

export default function AndroidAdvicePage() {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<AdSenseCostRevenueResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    // selectedAccount starts as null until we've identified the user. The first
    // useEffect below sets it to either 'all' (admin) or the user's own account.
    // This prevents a brief flash of 'all' data for non-admin users while the
    // auth cookies are being read.
    const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authReady, setAuthReady] = useState(false);
    const [isFromCache, setIsFromCache] = useState(false);
    const [cacheAge, setCacheAge] = useState<number | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs()]);
    const [searchText, setSearchText] = useState<string>('');
    const [sortBy, setSortBy] = useState<string>('cost');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(20);
    const [accountsMeta, setAccountsMeta] = useState<{ cid: string; seq: number | null }[]>([]);

    const accountLabel = (cid: string) => {
        const found = accountsMeta.find(a => a.cid === cid);
        return found && found.seq != null
            ? `androidadvices ${String(found.seq).padStart(2, '0')} (${cid})`
            : cid;
    };

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

    // Phase 1: read auth cookies and decide which account this user is allowed to see.
    // Nothing renders or fetches until this completes — prevents the all-accounts
    // flash that previously leaked admin-cached data to regular users.
    const [allocatedAccounts, setAllocatedAccounts] = useState<string[]>([]);

    useEffect(() => {
        fetch('/api/accounts/labels')
            .then(r => r.json())
            .then(({ accounts }) => setAccountsMeta(accounts || []))
            .catch(() => { });
    }, []);

    useEffect(() => {
        fetch('/api/auth/me')
            .then(r => r.json())
            .then(({ user }) => {
                if (!user) {
                    setSelectedAccount(null);
                    setAuthReady(true);
                    return;
                }
                const admin = user.role === 'admin';
                setIsAdmin(admin);
                setAllocatedAccounts(user.accounts || []);
                setSelectedAccount(admin ? 'all' : 'user');
                setAuthReady(true);
            })
            .catch(() => {
                setSelectedAccount(null);
                setAuthReady(true);
            });
    }, []);

    // Phase 2: only fetch data once auth is resolved AND we know which account.
    // The selectedAccount/dateRange dependency catches subsequent user-driven changes.
    useEffect(() => {
        if (!authReady || !selectedAccount) return;

        const cached = loadCachedData(selectedAccount, dateRange);
        if (cached) {
            setData(cached);
            setIsFromCache(true);
            setIsRefreshing(true);
        } else if (!isFirstMount.current) {
            setData(null);
        }
        fetchData(selectedAccount);
        isFirstMount.current = false;
    }, [authReady, selectedAccount, dateRange]);

    // Background auto-refresh: poll every 5 min so users always see near-fresh
    // data without touching a Refresh button. Silent mode = no spinner, no error
    // banner if the poll fails; the existing data stays on screen. Server-side
    // Redis is warmed by the cron every 12 min, so most polls resolve in <500ms.
    useEffect(() => {
        if (!authReady || !selectedAccount) return;
        const interval = setInterval(() => {
            fetchData(selectedAccount, true);
        }, AUTO_REFRESH_MS);
        return () => clearInterval(interval);
    }, [authReady, selectedAccount, dateRange]);

    // silent=true means "background auto-refresh" — no spinner, no error banner
    // on failure. Keeps existing data on screen if the poll hiccups.
    const fetchData = async (accountOverride?: string, silent = false) => {
        const account = accountOverride ?? selectedAccount;

        if (!silent) setLoading(true);
        if (!silent) setError(null);

        try {
            // Publisher ID is resolved server-side from ANDROIDADVICE_PUBLISHER_ID env;
            // client never sends one for androidadvice to avoid cross-feed mixups.
            const requestBody: any = {
                startDate: dateRange[0].format('YYYY-MM-DD'),
                endDate: dateRange[1].format('YYYY-MM-DD'),
                adsenseAccountType: 'androidadvice',
                forceLive: false,
                useDb: true,
            };

            // Send the specific account when one is picked (admin or user).
            // 'user' and 'all' mean "all my scope" — send nothing, server scopes it.
            if (account !== 'all' && account !== 'user') {
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
            if (account) saveCacheData(account, dateRange, result);
            setIsFromCache(false);
            setIsRefreshing(false);
            setCacheAge(0);
        } catch (err: any) {
            if (!silent) setError(err.message || 'Failed to fetch AndroidAdvice data');
            setIsRefreshing(false);
        } finally {
            if (!silent) setLoading(false);
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
        const totalCost = campaigns.reduce((s: number, c: any) => s + (c.cost || 0), 0);
        let totalRevenue = campaigns.reduce((s: number, c: any) => s + (c.revenue || 0), 0);
        let totalProfit = campaigns.reduce((s: number, c: any) => s + (c.profit || 0), 0);

        // Include unattributed revenue in the totals only when the row is also visible
        // in the table: admin user on the All-Accounts view and no campaign search filter.
        // Unattributed has no cost, so it lands fully in profit.
        const unattributed = (data as any)?.unattributed_revenue;
        const includeUnattributed =
            isAdmin &&
            selectedAccount === 'all' &&
            !searchText &&
            unattributed && unattributed.total > 0;
        if (includeUnattributed) {
            totalRevenue += unattributed.total;
            totalProfit += unattributed.total;
        }

        // Other sites (queryvaults.com etc.) — same AdSense publisher, par
        // AndroidAdvice ka hissa nahi. Isliye totals me NAHI jodte, alag dikhate hain.
        const otherSites = (data as any)?.other_sites;
        const otherSitesTotal = otherSites?.total || 0;

        return { totalCost, totalRevenue, totalProfit, unattributedIncluded: includeUnattributed, otherSitesTotal };
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
                                    <CacheIndicator isFromCache={isFromCache} isRefreshing={isRefreshing || loading} cacheAge={cacheAge} />
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
                                    disabled={false}
                                >
                                    {isAdmin && <Option value="all">All AndroidAdvice Accounts</Option>}
                                    {!isAdmin && allocatedAccounts.length > 1 && (
                                        <Option value="user">All my accounts ({allocatedAccounts.length})</Option>
                                    )}
                                    {(isAdmin ? accountsMeta.map(a => a.cid) : allocatedAccounts).map(id => (
                                        <Option key={id} value={id}>{accountLabel(id)}</Option>
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
                                    onClick={() => fetchData()}
                                    loading={loading}
                                >
                                    Refresh
                                </Button>
                                {/* <Text type="secondary" style={{ fontSize: 12 }}>
                                    Auto-refreshes every 5 min. Server cache warmed every 12 min.
                                </Text> */}
                            </div>
                        </Col>
                    </Row>

                    {error && !data && (
                        <Alert message="Error" description={error} type="error" showIcon style={{ marginBottom: 24 }} />
                    )}


                    {loading && !data && <DashboardSkeleton />}

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
                                    {filteredSummary.unattributedIncluded && (
                                        <div style={{ marginTop: 12, fontSize: 12, color: '#8c8c8c', fontStyle: 'italic' }}>
                                            Includes unattributed (organic / other) revenue.
                                        </div>
                                    )}
                                </div>
                            </Col>

                            {/* Account-Level Table for All Accounts view */}
                            {(selectedAccount === 'all' || selectedAccount === 'user') && data.account_level_aggregated?.length > 0 && (() => {
                                const unattributed = (data as any).unattributed_revenue;
                                const otherSites = (data as any).other_sites;
                                const showUnattributed = isAdmin && unattributed && unattributed.total > 0;

                                // Har doosri website ki apni row (naam ke saath).
                                const otherSiteRows = (isAdmin && otherSites?.sites?.length)
                                    ? otherSites.sites.map((s: any) => ({
                                        account_id: `__site_${s.domain}`,
                                        campaignCount: 0,
                                        cost: 0,
                                        revenue: s.earnings,
                                        profit: 0,
                                        roi: 0,
                                        conversions: 0,
                                        __isOtherSite: true,
                                        __domain: s.domain,
                                    }))
                                    : [];

                                const dataSource = [
                                    ...data.account_level_aggregated,
                                    ...(showUnattributed ? [{
                                        account_id: '__unattributed__',
                                        campaignCount: unattributed.styleIdCount,
                                        cost: 0,
                                        revenue: unattributed.total,
                                        profit: unattributed.total,
                                        roi: 0,
                                        conversions: 0,
                                        __isUnattributed: true,
                                        __styleIdCount: unattributed.styleIdCount,
                                    }] : []),

                                ];

                                return (
                                    <Col span={24}>
                                        <Card title={<Title level={4}>Account-Level Performance</Title>}>
                                            <Table
                                                columns={[
                                                    {
                                                        title: 'Account',
                                                        dataIndex: 'account_id',
                                                        key: 'account_id',
                                                        render: (id: string, row: any) =>
                                                            row.__isOtherSite
                                                                ? (
                                                                    <Tooltip title="Revenue from another site on the same AdSense publisher account. Not part of AndroidAdvice — shown for reference only.">
                                                                        <Text strong style={{ color: '#1890ff', fontStyle: 'italic' }}>
                                                                            {row.__domain}
                                                                        </Text>
                                                                    </Tooltip>
                                                                )
                                                                : row.__isUnattributed
                                                                    ? (
                                                                        <Tooltip title="Revenue on androidadvices.com from style_ids that don't match any current Google Ads campaign (organic / direct / external traffic). Admin-only.">
                                                                            <Text strong style={{ color: '#8c8c8c', fontStyle: 'italic' }}>
                                                                                Unattributed (organic / other)
                                                                            </Text>
                                                                        </Tooltip>
                                                                    )
                                                                    : <Text strong>{accountLabel(id)}</Text>,
                                                    },
                                                    {
                                                        title: 'Campaigns',
                                                        dataIndex: 'campaignCount',
                                                        key: 'campaignCount',
                                                        render: (v: number, row: any) =>
                                                            row.__isUnattributed || row.__isOtherSite
                                                                ? <Text type="secondary">{row.__styleIdCount > 0 ? `${row.__styleIdCount} style${row.__styleIdCount === 1 ? '' : 's'}` : '—'}</Text>
                                                                : v,
                                                    },
                                                    {
                                                        title: 'Cost',
                                                        dataIndex: 'cost',
                                                        key: 'cost',
                                                        render: (v: number, row: any) =>
                                                            row.__isUnattributed || row.__isOtherSite
                                                                ? <Text type="secondary">—</Text>
                                                                : <Text style={{ color: '#ff4d4f' }}>${(v || 0).toFixed(2)}</Text>,
                                                        sorter: (a: any, b: any) => a.cost - b.cost,
                                                    },
                                                    {
                                                        title: 'Revenue',
                                                        dataIndex: 'revenue',
                                                        key: 'revenue',
                                                        render: (v: number) => <Text style={{ color: '#52c41a' }}>${(v || 0).toFixed(2)}</Text>,
                                                        sorter: (a: any, b: any) => a.revenue - b.revenue,
                                                    },
                                                    {
                                                        title: 'Profit',
                                                        dataIndex: 'profit',
                                                        key: 'profit',
                                                        render: (v: number, row: any) =>
                                                            row.__isUnattributed || row.__isOtherSite
                                                                ? <Text type="secondary">—</Text>
                                                                : <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>${(v || 0).toFixed(2)}</Text>,
                                                        sorter: (a: any, b: any) => a.profit - b.profit,
                                                    },
                                                    {
                                                        title: 'ROI',
                                                        dataIndex: 'roi',
                                                        key: 'roi',
                                                        render: (v: number, row: any) =>
                                                            row.__isUnattributed || row.__isOtherSite
                                                                ? <Text type="secondary">—</Text>
                                                                : <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>{(v || 0).toFixed(1)}%</Text>,
                                                        sorter: (a: any, b: any) => a.roi - b.roi,
                                                    },
                                                    {
                                                        title: 'Conversions',
                                                        dataIndex: 'conversions',
                                                        key: 'conversions',
                                                        render: (v: number, row: any) =>
                                                            row.__isUnattributed || row.__isOtherSite
                                                                ? <Text type="secondary">—</Text>
                                                                : Math.round(v || 0).toLocaleString(),
                                                    },
                                                ]}
                                                dataSource={dataSource}
                                                rowKey="account_id"
                                                pagination={false}
                                                size="middle"
                                                scroll={{ x: 800 }}
                                                rowClassName={(row: any) => row.__isUnattributed ? 'aa-unattributed-row' : ''}
                                            />
                                            <style dangerouslySetInnerHTML={{
                                                __html: `.aa-unattributed-row { background: #fafafa !important; }
.aa-unattributed-row:hover > td { background: #f0f7ff !important; }`
                                            }} />
                                        </Card>
                                    </Col>
                                );
                            })()}

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
