'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Typography, Card, Form, Input, Button, Select, App } from 'antd';
import { MailOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { useRouter } from 'next/navigation';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;

function AddUserContent() {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const [accounts, setAccounts] = useState<{ cid: string; seq: number | null }[]>([]);
    const [holders, setHolders] = useState<Record<string, string>>({});
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [newAccountInput, setNewAccountInput] = useState('');
    const [addingAccount, setAddingAccount] = useState(false);
    const router = useRouter();

    const load = useCallback(async () => {
        try {
            const [aRes, hRes] = await Promise.all([
                fetch('/api/accounts/list').then(r => r.json()),
                fetch('/api/accounts/holders').then(r => r.json()),
            ]);
            setAccounts(aRes.accounts || []);
            setHolders(hRes.holders || {});
        } catch {
            message.error('Failed to load accounts');
        }
    }, [message]);

    useEffect(() => { load(); }, [load]);

    const onEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const local = e.target.value.split('@')[0] || '';
        form.setFieldsValue({ username: local.replace(/[^a-zA-Z0-9._-]/g, '') });
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

    const onCreate = async (values: { email: string; username: string; password: string }) => {
        if (selectedAccounts.length === 0) {
            message.error('Allocate at least 1 account');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/team/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...values, accountCids: selectedAccounts }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            message.success(`User ${values.email} created`);
            form.resetFields();
            setSelectedAccounts([]);
            router.push('/team');
        } catch (e: any) {
            message.error(e.message || 'Create failed');
        } finally {
            setLoading(false);
        }
    };

    const accountLabel = (cid: string, seq: number | null) =>
        seq != null ? `androidadvices ${String(seq).padStart(2, '0')} (${cid})` : cid;

    return (
        <Content style={{ padding: 24, background: '#f0f2f5' }}>
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
                <Title level={3}>Add User</Title>
                <Card>
                    <Text type="secondary">Create a user directly. They can log in immediately with these credentials.</Text>
                    <Form form={form} layout="vertical" onFinish={onCreate} style={{ marginTop: 16 }}>
                        <Form.Item
                            name="email"
                            label="Email"
                            rules={[{ required: true, message: 'Enter email' }, { type: 'email', message: 'Invalid email' }]}
                        >
                            <Input prefix={<MailOutlined />} placeholder="Email" onChange={onEmailChange} />
                        </Form.Item>

                        <Form.Item
                            name="username"
                            label="Username"
                            rules={[{ required: true, message: 'Username required' }]}
                        >
                            <Input prefix={<UserOutlined />} placeholder="Username" />
                        </Form.Item>

                        <Form.Item
                            name="password"
                            label="Password"
                            rules={[{ required: true, message: 'Enter password' }, { min: 8, message: 'Min 8 characters' }]}
                        >
                            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
                        </Form.Item>

                        <Form.Item label="Allocate accounts">
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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
                                style={{ width: '100%' }}
                                placeholder="Choose accounts"
                                value={selectedAccounts}
                                onChange={setSelectedAccounts}
                                optionLabelProp="label"
                            >
                                {accounts.map(({ cid, seq }) => {
                                    const heldBy = holders[cid];
                                    const label = accountLabel(cid, seq);
                                    return (
                                        <Option key={cid} value={cid} label={label} disabled={!!heldBy}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{label}</span>
                                                {heldBy && <span style={{ color: '#8c8c8c', fontSize: 12 }}>{heldBy}</span>}
                                            </div>
                                        </Option>
                                    );
                                })}
                            </Select>
                        </Form.Item>

                        <Form.Item>
                            <Button type="primary" htmlType="submit" loading={loading}>Add User</Button>
                        </Form.Item>
                    </Form>
                </Card>
            </div>
        </Content>
    );
}

export default function AddUserPage() {
    return (
        <DashboardLayout>
            <App>
                <AddUserContent />
            </App>
        </DashboardLayout>
    );
}