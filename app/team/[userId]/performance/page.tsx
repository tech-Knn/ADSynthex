'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Typography, Card, Select, DatePicker, App, Input, Button } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import dayjs, { Dayjs } from 'dayjs';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

function PerfContent() {
    const { message } = App.useApp();
    const params = useParams();
    const userId = params?.userId as string;
    const [userLabel, setUserLabel] = useState('');
    const [accounts, setAccounts] = useState<{ cid: string; seq: number | null }[]>([]);
    const [userAccounts, setUserAccounts] = useState<string[]>([]);
    const [selectedAccount, setSelectedAccount] = useState('all');
    const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs()]);
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [campaignSearch, setCampaignSearch] = useState('');
    const [sortBy, setSortBy] = useState('cost');
    const [sortOrder, setSortOrder] = useState('desc');
    const router = useRouter();

    const accountLabel = (cid: string) => {
        const seq = accounts.find(a => a.cid === cid)?.seq ?? null;
        return seq != null ? `androidadvices ${String(seq).padStart(2, '0')} (${cid})` : cid;
    };
    const flag = (country: string) => {
        if (!country || country.length !== 2) return country || '—';
        const code = country.toUpperCase();
        const emoji = String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
        return `${emoji} ${code}`;
    };
    const shownCampaigns = campaigns
        .filter((c) => {
            const q = campaignSearch.toLowerCase();
            return !q ||
                (c.campaignName || '').toLowerCase().includes(q) ||
                String(c.styleId).toLowerCase().includes(q) ||
                (c.country || '').toLowerCase().includes(q);
        })
        .sort((a, b) => {
            const dir = sortOrder === 'asc' ? 1 : -1;
            return ((a[sortBy] || 0) - (b[sortBy] || 0)) * dir;
        });

    // Load the user detail (for label + their allocated accounts) and the global label list
    useEffect(() => {
        fetch(`/api/team/${userId}`).then(r => r.json()).then(({ user }) => {
            if (user) { setUserLabel(user.username || user.email); setUserAccounts(user.accounts || []); }
        });
        fetch('/api/accounts/labels').then(r => r.json()).then(({ accounts }) => setAccounts(accounts || []));
    }, [userId]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [start, end] = range;
            const qs = new URLSearchParams({
                startDate: start.format('YYYY-MM-DD'),
                endDate: end.format('YYYY-MM-DD'),
                account: selectedAccount,
            });
            const res = await fetch(`/api/team/${userId}/performance?${qs}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setRows(data.rows || []);
            setCampaigns(data.campaigns || []);
        } catch (e: any) {
            message.error(e.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [userId, range, selectedAccount, message]);

    useEffect(() => { load(); }, [load]);

    const totalCost = rows.reduce((s, r) => s + (r.cost || 0), 0);
    const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const totalRoi = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    return (
        <Content style={{ padding: 24, background: '#f0f2f5' }}>
            <div style={{ maxWidth: 1400, margin: '0 auto' }}>
                <Card style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Button
                            type="text"
                            icon={<ArrowLeftOutlined />}
                            onClick={() => router.push('/team')}
                            style={{ fontSize: 18 }}
                        />
                        <Title level={3} style={{ margin: 0 }}>Performance — {userLabel}</Title>
                    </div>
                </Card>

                <Card style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ minWidth: 320 }}>
                            <Text strong>Google Ads Account</Text>
                            <Select style={{ width: '100%', marginTop: 8 }} value={selectedAccount} onChange={setSelectedAccount}>
                                <Option value="all">All allocated accounts ({userAccounts.length})</Option>
                                {userAccounts.map(cid => <Option key={cid} value={cid}>{accountLabel(cid)}</Option>)}
                            </Select>
                        </div>
                        <div>
                            <Text strong>Date Range</Text><br />
                            <RangePicker
                                style={{ marginTop: 8 }}
                                value={range}
                                onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
                                allowClear={false}
                                 disabledDate={(current) => current && current > dayjs().endOf('day')}
                            />
                        </div>
                    </div>
                    {/* <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        onClick={load}
                        loading={loading}
                        style={{ marginTop: 16 }}
                    >
                        Refresh
                    </Button> */}
                </Card>

                <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={load}
                    loading={loading}
                    style={{ marginTop: 16 }}
                >
                    Refresh
                </Button>

                <Card style={{ marginTop: 16, marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', maxWidth: 1200, justifyContent: 'space-between' }}>
                        <div><Text type="secondary">Total Cost</Text><br /><Text style={{ fontSize: 28, fontWeight: 700, color: '#ff4d4f' }}>${totalCost.toFixed(2)}</Text></div>
                        <div><Text type="secondary">Total Revenue</Text><br /><Text style={{ fontSize: 28, fontWeight: 700, color: '#52c41a' }}>${totalRevenue.toFixed(2)}</Text></div>
                        <div><Text type="secondary">Total Profit</Text><br /><Text style={{ fontSize: 28, fontWeight: 700, color: totalProfit >= 0 ? '#52c41a' : '#ff4d4f' }}>${totalProfit.toFixed(2)}</Text></div>
                        <div><Text type="secondary">ROI</Text><br /><Text style={{ fontSize: 28, fontWeight: 700, color: totalRoi >= 0 ? '#52c41a' : '#ff4d4f' }}>{totalRoi.toFixed(2)}%</Text></div>
                    </div>
                </Card>

                <Card title={<Title level={4} style={{ margin: 0 }}>Account-Level Performance</Title>}>
                    {loading ? (
                        <div style={{ padding: 40, textAlign: 'center' }}><Text type="secondary">Loading…</Text></div>
                    ) : rows.length === 0 ? (
                        <Text type="secondary">No data for the selected range.</Text>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                <thead>
                                    <tr style={{ background: '#fafafa' }}>
                                        <th style={{ textAlign: 'left', padding: 12, fontWeight: 600 }}>Account</th>
                                        <th style={{ textAlign: 'left', padding: 12, fontWeight: 600 }}>Campaigns</th>
                                        <th style={{ textAlign: 'right', padding: 12, fontWeight: 600 }}>Cost</th>
                                        <th style={{ textAlign: 'right', padding: 12, fontWeight: 600 }}>Revenue</th>
                                        <th style={{ textAlign: 'right', padding: 12, fontWeight: 600 }}>Profit</th>
                                        <th style={{ textAlign: 'right', padding: 12, fontWeight: 600 }}>ROI</th>
                                        <th style={{ textAlign: 'right', padding: 12, fontWeight: 600 }}>Conversions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.accountCid} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                            <td style={{ padding: 12, fontWeight: 600 }}>{accountLabel(row.accountCid)}</td>
                                            <td style={{ padding: 12 }}>{row.campaigns}</td>
                                            <td style={{ padding: 12, textAlign: 'right', color: '#ff4d4f' }}>${(row.cost || 0).toFixed(2)}</td>
                                            <td style={{ padding: 12, textAlign: 'right', color: '#52c41a' }}>${(row.revenue || 0).toFixed(2)}</td>
                                            <td style={{ padding: 12, textAlign: 'right', color: (row.profit || 0) >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>${(row.profit || 0).toFixed(2)}</td>
                                            <td style={{ padding: 12, textAlign: 'right', color: (row.roi || 0) >= 0 ? '#52c41a' : '#ff4d4f' }}>{(row.roi || 0).toFixed(1)}%</td>
                                            <td style={{ padding: 12, textAlign: 'right' }}>{Math.round(row.conversions || 0).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                <Card title={<Title level={4} style={{ margin: 0 }}>Campaigns-Level Performance</Title>} style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
                        <div style={{ flex: 1, minWidth: 240 }}>
                            <Text strong>Search Campaign, Style ID or Country</Text>
                            <Input
                                placeholder="Search by Campaign Name, Style ID, or Country"
                                prefix={<span style={{ color: '#bfbfbf' }}>🔍</span>}
                                value={campaignSearch}
                                onChange={(e) => setCampaignSearch(e.target.value)}
                                allowClear
                                style={{ marginTop: 8 }}
                            />
                        </div>
                        <div style={{ minWidth: 180 }}>
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
                        </div>
                        <div style={{ minWidth: 180 }}>
                            <Text strong>Sort Order</Text>
                            <Select style={{ width: '100%', marginTop: 8 }} value={sortOrder} onChange={setSortOrder}>
                                <Option value="desc">Highest First</Option>
                                <Option value="asc">Lowest First</Option>
                            </Select>
                        </div>
                    </div>
                    {loading ? (
                        <div style={{ padding: 40, textAlign: 'center' }}><Text type="secondary">Loading…</Text></div>
                    ) : shownCampaigns.length === 0 ? (
                        <Text type="secondary">No campaigns for the selected range.</Text>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'auto' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 600, background: '#e9e9ef', borderRadius: '8px 8px 0 0' }}>Campaign</th>
                                        <th style={{ width: 6, background: 'transparent' }}></th>
                                        <th style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 600, background: '#cfe4fb', color: '#0958d9', borderRadius: '8px 8px 0 0' }}>Style ID</th>
                                        <th style={{ width: 6, background: 'transparent' }}></th>
                                        <th style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 600, background: '#fce7ba', color: '#d46b08', borderRadius: '8px 8px 0 0' }}>Country</th>
                                        <th style={{ width: 6, background: 'transparent' }}></th>
                                        <th colSpan={3} style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 600, background: '#cfe4fb', color: '#0958d9', borderRadius: '8px 8px 0 0' }}>Google Ads</th>
                                        <th style={{ width: 6, background: 'transparent' }}></th>
                                        <th colSpan={3} style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 600, background: '#bff0e4', color: '#08979c', borderRadius: '8px 8px 0 0' }}>AdSense</th>
                                        <th style={{ width: 6, background: 'transparent' }}></th>
                                        <th colSpan={2} style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 600, background: '#e4d3fb', color: '#531dab', borderRadius: '8px 8px 0 0' }}>Performance</th>
                                    </tr>
                                    <tr style={{ background: '#fafafa' }}>
                                        <th style={{ padding: 10 }}></th>
                                        <th style={{ width: 6 }}></th>
                                        <th style={{ padding: 10, textAlign: 'center', fontWeight: 500, color: '#8c8c8c' }}>ID</th>
                                        <th style={{ width: 6 }}></th>
                                        <th style={{ padding: 10, textAlign: 'center', fontWeight: 500, color: '#8c8c8c' }}>Flag</th>
                                        <th style={{ width: 6 }}></th>
                                        <th style={{ padding: 10, textAlign: 'right', fontWeight: 500, color: '#8c8c8c' }}>Cost</th>
                                        <th style={{ padding: 10, textAlign: 'right', fontWeight: 500, color: '#8c8c8c' }}>CPA</th>
                                        <th style={{ padding: 10, textAlign: 'right', fontWeight: 500, color: '#8c8c8c' }}>Conv.</th>
                                        <th style={{ width: 6 }}></th>
                                        <th style={{ padding: 10, textAlign: 'right', fontWeight: 500, color: '#8c8c8c' }}>Revenue</th>
                                        <th style={{ padding: 10, textAlign: 'right', fontWeight: 500, color: '#8c8c8c' }}>Clicks</th>
                                        <th style={{ padding: 10, textAlign: 'right', fontWeight: 500, color: '#8c8c8c' }}>RPC</th>
                                        <th style={{ width: 8 }}></th>
                                        <th style={{ padding: 10, textAlign: 'right', fontWeight: 500, color: '#8c8c8c' }}>Profit</th>
                                        <th style={{ padding: 10, textAlign: 'right', fontWeight: 500, color: '#8c8c8c' }}>ROI</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shownCampaigns.map((c) => (
                                        <tr key={c.campaignId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                            <td style={{ padding: 10 }}>{c.campaignName}</td>
                                            <td style={{ width: 5 }}></td>
                                            <td style={{ padding: 10, textAlign: 'center', color: '#0958d9' }}>{c.styleId}</td>
                                            <td style={{ width: 5 }}></td>
                                            <td style={{ padding: 10, textAlign: 'center' }}>{flag(c.country)}</td>
                                            <td style={{ width: 5 }}></td>
                                            <td style={{ padding: 10, textAlign: 'right', color: '#ff4d4f' }}>${(c.cost || 0).toFixed(2)}</td>
                                            <td style={{ padding: 10, textAlign: 'right' }}>${(c.cpa || 0).toFixed(2)}</td>
                                            <td style={{ padding: 10, textAlign: 'right', color: '#722ed1' }}>{Math.round(c.conversions || 0)}</td>
                                            <td style={{ width: 5 }}></td>
                                            <td style={{ padding: 10, textAlign: 'right', color: '#52c41a' }}>${(c.revenue || 0).toFixed(2)}</td>
                                            <td style={{ padding: 10, textAlign: 'right', color: '#1677ff' }}>{Math.round(c.clicks || 0)}</td>
                                            <td style={{ padding: 10, textAlign: 'right', color: '#fa8c16' }}>${(c.rpc || 0).toFixed(4)}</td>
                                            <td style={{ width: 8 }}></td>
                                            <td style={{ padding: 10, textAlign: 'right', color: (c.profit || 0) >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>${(c.profit || 0).toFixed(2)}</td>
                                            <td style={{ padding: 10, textAlign: 'right', color: (c.roi || 0) >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{(c.roi || 0).toFixed(2)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </Content >
    );
}

export default function PerformancePage() {
    return (
        <DashboardLayout>
            <App>
                <PerfContent />
            </App>
        </DashboardLayout>
    );
}