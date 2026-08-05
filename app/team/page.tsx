'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Typography, Table, Button, Card, Select, Modal, Tag, App, Input } from 'antd';
import DashboardLayout from '@/components/Layout/DashboardLayout';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

// const AA_ACCOUNTS = [
//     '8701280199', '3765399744', '3617356950', '4932880256', '3764963776', '4702286319',
//     '8182947427', '7423206633', '7753453760', '9785664835', '5418244007', '1223790856',
//     '7416756000', '2039691127', '5193468964', '4457984442', '9220539746', '8693469647', '9722524142',
// ];

interface TeamUser {
    id: string; email: string; username: string | null; role: string;
    status: string; accountCount: number; accounts: string[];
}
interface PendingUser {
    id: string; email: string; username: string | null;
}

function TeamContent() {
    const { message } = App.useApp();
    const [users, setUsers] = useState<TeamUser[]>([]);
    const [pending, setPending] = useState<PendingUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [approveModal, setApproveModal] = useState<PendingUser | null>(null);
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [holders, setHolders] = useState<Record<string, string>>({});
    const [editModal, setEditModal] = useState<TeamUser | null>(null);
    const [editAccounts, setEditAccounts] = useState<string[]>([]);
    const [savingEdit, setSavingEdit] = useState(false);
    const [accounts, setAccounts] = useState<{ cid: string; seq: number | null }[]>([]);
    const [newAccountInput, setNewAccountInput] = useState('');
    const [addingAccount, setAddingAccount] = useState(false);
    const accountLabel = (cid: string, seq: number | null) =>
        seq != null ? `androidadvices ${String(seq).padStart(2, '0')} (${cid})` : cid;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [uRes, pRes, hRes, aRes] = await Promise.all([
                fetch('/api/team').then(r => r.json()),
                fetch('/api/team/pending').then(r => r.json()),
                fetch('/api/accounts/holders').then(r => r.json()),
                fetch('/api/accounts/list').then(r => r.json()),
            ]);
            setUsers(uRes.users || []);
            setPending(pRes.pending || []);
            setHolders(hRes.holders || {});
            setAccounts(aRes.accounts || []);
        } catch {
            message.error('Failed to load team');
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => { load(); }, [load]);

    const approve = async () => {
        if (!approveModal) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/team/${approveModal.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountCids: selectedAccounts }),
            });
            if (!res.ok) throw new Error();
            message.success('User approved');
            setApproveModal(null);
            setSelectedAccounts([]);
            load();
        } catch {
            message.error('Approve failed');
        } finally {
            setSubmitting(false);
        }
    };

    const reject = async (id: string) => {
        try {
            const res = await fetch(`/api/team/${id}/reject`, { method: 'POST' });
            if (!res.ok) throw new Error();
            message.success('User rejected');
            load();
        } catch {
            message.error('Reject failed');
        }
    };

    const remove = async (id: string) => {
        if (!confirm('Delete this user? This removes their allocations too.')) return;
        try {
            const res = await fetch(`/api/team/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            message.success('User deleted');
            load();
        } catch (e: any) {
            message.error(e.message || 'Delete failed');
        }
    };

    const openEdit = async (id: string) => {
        try {
            const res = await fetch(`/api/team/${id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setEditModal(data.user);
            setEditAccounts(data.user.accounts || []);
        } catch (e: any) {
            message.error(e.message || 'Failed to load user');
        }
    };

    const saveEdit = async () => {
        if (!editModal) return;
        setSavingEdit(true);
        try {
            const res = await fetch('/api/allocations/reassign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: editModal.id, accountCids: editAccounts }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            message.success('Accounts updated');
            setEditModal(null);
            load();
        } catch (e: any) {
            message.error(e.message || 'Update failed');
        } finally {
            setSavingEdit(false);
        }
    };

    const addAccount = async () => {
        if (!/^\d{10}$/.test(newAccountInput)) {
            message.error('Enter a 10-digit account number');
            return;
        }
        setAddingAccount(true);
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cid: newAccountInput }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            message.success(`Account ${data.cid} added`);
            setAccounts(prev => [...prev, { cid: data.cid, seq: data.seq }]);
            setNewAccountInput('');
        } catch (e: any) {
            message.error(e.message || 'Add failed');
        } finally {
            setAddingAccount(false);
        }
    };

    return (
        <Content style={{ padding: 24, background: '#f0f2f5' }}>
            <div style={{ maxWidth: 1400, margin: '0 auto' }}>
                <Title level={3}>Manage Team</Title>

                {pending.length > 0 && (
                    <Card title="Pending Signups" style={{ marginBottom: 24 }}>
                        <Table
                            rowKey="id"
                            loading={loading}
                            pagination={false}
                            dataSource={pending}
                            columns={[
                                { title: 'Email', dataIndex: 'email' },
                                { title: 'Username', dataIndex: 'username' },
                                {
                                    title: 'Action',
                                    render: (_: any, row: PendingUser) => (
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <Button type="primary" onClick={() => { setApproveModal(row); setSelectedAccounts([]); }}>
                                                Approve
                                            </Button>
                                            <Button danger onClick={() => reject(row.id)}>Reject</Button>
                                        </div>
                                    ),
                                },
                            ]}
                        />
                    </Card>
                )}

                <Card title="All Members">
                    <Table
                        rowKey="id"
                        loading={loading}
                        pagination={false}
                        dataSource={users}
                        columns={[
                            { title: 'Email', dataIndex: 'email' },
                            { title: 'Username', dataIndex: 'username' },
                            {
                                title: 'Role',
                                dataIndex: 'role',
                                render: (r: string) => <Tag color={r === 'admin' ? 'purple' : 'blue'}>{r}</Tag>,
                            },
                            {
                                title: 'Status',
                                dataIndex: 'status',
                                render: (s: string) => (
                                    <Tag color={s === 'active' ? 'green' : s === 'pending' ? 'orange' : 'red'}>{s}</Tag>
                                ),
                            },
                            { title: 'Accounts', dataIndex: 'accountCount' },
                            {
                                title: 'Action',
                                render: (_: any, row: TeamUser) =>
                                    row.role === 'admin' ? (
                                        <Text type="secondary">—</Text>
                                    ) : (
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {row.status !== 'rejected' && (
                                                <Button size="small" onClick={() => openEdit(row.id)}>Add / Edit</Button>
                                            )}
                                            <Button danger size="small" onClick={() => remove(row.id)}>Delete</Button>
                                        </div>
                                    ),
                            },
                        ]}
                    />
                </Card>

                {/* Approval Modal */}
                <Modal
                    title={`Approve ${approveModal?.email ?? ''}`}
                    open={!!approveModal}
                    onOk={approve}
                    onCancel={() => setApproveModal(null)}
                    confirmLoading={submitting}
                    okText="Approve & Allocate"
                >
                    <Text>Select accounts to allocate to this user:</Text>
                    <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
                        <Input
                            placeholder="Add new 10-digit account"
                            value={newAccountInput}
                            onChange={(e) => setNewAccountInput(e.target.value)}
                            maxLength={10}
                        />
                        <Button onClick={addAccount} loading={addingAccount}>Add</Button>
                    </div>
                    <Select
                        mode="multiple"
                        style={{ width: '100%', marginTop: 12 }}
                        placeholder="Choose accounts"
                        value={selectedAccounts}
                        onChange={setSelectedAccounts}
                        optionLabelProp="label"
                        onDeselect={() => { }}
                    >
                        {accounts.map(({ cid, seq }) => {
                            const heldBy = holders[cid];
                            const isOwn = editModal?.accounts?.includes(cid);
                            const blocked = !!heldBy && !isOwn;
                            const label = accountLabel(cid, seq);
                            return (
                                <Option key={cid} value={cid} label={label} disabled={blocked}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{label}</span>
                                        {blocked && <span style={{ color: '#8c8c8c', fontSize: 12 }}>{heldBy}</span>}
                                    </div>
                                </Option>
                            );
                        })}
                    </Select>
                </Modal>

                {/* Edit Modal */}
                <Modal
                    title={`Edit ${editModal?.email ?? ''}`}
                    open={!!editModal}
                    onOk={saveEdit}
                    onCancel={() => setEditModal(null)}
                    confirmLoading={savingEdit}
                    okText="Save Accounts"
                >
                    <div style={{ marginBottom: 12 }}>
                        <Text type="secondary">Email:</Text> <Text>{editModal?.email}</Text><br />
                        <Text type="secondary">Username:</Text> <Text>{editModal?.username}</Text><br />
                        <Text type="secondary">Role:</Text> <Text>{editModal?.role}</Text><br />
                        <Text type="secondary">Status:</Text> <Text>{editModal?.status}</Text>
                    </div>
                    <Text strong>Allocated accounts:</Text>
                    <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
                        <Input
                            placeholder="Add new 10-digit account"
                            value={newAccountInput}
                            onChange={(e) => setNewAccountInput(e.target.value)}
                            maxLength={10}
                        />
                        <Button onClick={addAccount} loading={addingAccount}>Add</Button>
                    </div>
                    <Select
                        mode="multiple"
                        style={{ width: '100%', marginTop: 8 }}
                        placeholder="Choose accounts"
                        value={editAccounts}
                        onChange={setEditAccounts}
                        optionLabelProp="label"
                    >
                        {accounts.map(({ cid, seq }) => {
                            const heldBy = holders[cid];
                            const isOwn = editModal?.accounts?.includes(cid);
                            const blocked = !!heldBy && !isOwn;
                            const label = accountLabel(cid, seq);
                            return (
                                <Option key={cid} value={cid} label={label} disabled={blocked}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{label}</span>
                                        {blocked && <span style={{ color: '#8c8c8c', fontSize: 12 }}>{heldBy}</span>}
                                    </div>
                                </Option>
                            );
                        })}
                    </Select>
                </Modal>
            </div>
        </Content>
    );
}

export default function TeamPage() {
    return (
        <DashboardLayout>
            <App>
                <TeamContent />
            </App>
        </DashboardLayout>
    );
}