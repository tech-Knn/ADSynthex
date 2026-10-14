'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Button, Input, Modal, Select, Table, Form } from 'antd';
import {
  UserAddOutlined, TeamOutlined, EyeOutlined, EditOutlined, DeleteOutlined, PlusOutlined,
  UserOutlined, UserDeleteOutlined, AppstoreOutlined, LockOutlined, MailOutlined,
} from '@ant-design/icons';
import Kpi, { fmtInt } from '@/components/AppShell/Kpi';

interface TeamUser {
  id: string;
  email: string;
  username: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'pending' | 'rejected';
  accountCount: number;
  accounts: string[];
}
interface AccountOpt { cid: string; seq: number | null }

type ModalMode = 'add' | 'edit' | null;

export default function ManageTeamPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [holders, setHolders] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ModalMode>(null);
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const accountLabel = (cid: string, seq: number | null) =>
    seq != null ? `androidadvices ${String(seq).padStart(2, '0')} (${cid})` : cid;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, hRes, aRes] = await Promise.all([
        fetch('/api/team').then((r) => r.json()),
        fetch('/api/accounts/holders').then((r) => r.json()),
        fetch('/api/accounts/list').then((r) => r.json()),
      ]);
      setUsers(uRes.users || []);
      setHolders(hRes.holders || {});
      setAccounts(aRes.accounts || []);
    } catch {
      message.error('Failed to load team');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === 'active').length;
    const inactive = users.filter((u) => u.status !== 'active').length;
    const totalAccounts = accounts.length;
    return { total, active, inactive, totalAccounts };
  }, [users, accounts]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setMode('add');
  };

  const openEdit = (u: TeamUser) => {
    setEditing(u);
    form.resetFields();
    form.setFieldsValue({ email: u.email, username: u.username, accountCids: u.accounts });
    setMode('edit');
  };

  const close = () => { setMode(null); setEditing(null); };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (mode === 'add') {
        const res = await fetch('/api/team/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: values.email,
            username: values.username,
            password: values.password,
            accountCids: values.accountCids || [],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Create failed');
        message.success('User created');
      } else if (mode === 'edit' && editing) {
        const res = await fetch('/api/allocations/reassign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: editing.id, accountCids: values.accountCids || [] }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Update failed');
        message.success('Accounts updated');
      }
      close();
      load();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (u: TeamUser) => {
    Modal.confirm({
      title: `Delete ${u.email}?`,
      content: 'This removes their account allocations too.',
      okText: 'Delete', okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await fetch(`/api/team/${u.id}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Delete failed');
          message.success('User deleted');
          load();
        } catch (e: any) {
          message.error(e.message || 'Delete failed');
        }
      },
    });
  };

  const accountOptions = accounts.map((a) => {
    const heldBy = holders[a.cid];
    const isOwn = editing?.accounts?.includes(a.cid);
    const blocked = !!heldBy && !isOwn;
    const label = accountLabel(a.cid, a.seq);
    return {
      value: a.cid,
      label: blocked ? `${label} — ${heldBy}` : label,
      disabled: blocked,
    };
  });

  const columns = [
    { title: 'Email', dataIndex: 'email' },
    { title: 'Username', dataIndex: 'username', render: (v: string | null) => v || '—' },
    {
      title: 'Role', dataIndex: 'role', width: 100,
      render: (r: string) => <span className={`status-pill ${r}`}>{r}</span>
    },
    {
      title: 'Status', dataIndex: 'status', width: 100,
      render: (s: string) => <span className={`status-pill ${s === 'active' ? 'active' : s === 'pending' ? 'pending' : 'inactive'}`}>{s}</span>
    },
    { title: 'Accounts', dataIndex: 'accountCount', width: 100, align: 'right' as const, render: (n: number) => fmtInt(n) },
    {
      title: 'Actions', width: 240, align: 'right' as const,
      render: (_: any, u: TeamUser) => (
        <div style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/manage-team/${u.id}`)}>View</Button>
          {u.role !== 'admin' && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(u)}>Edit</Button>
          )}
          {u.role !== 'admin' && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(u)}>Delete</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>Manage Team</h1>
          <p>View and manage all team members</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} className="btn-primary-gradient" onClick={openAdd}>
          Add User
        </Button>
      </div>

      <div className="kpi-grid">
        <Kpi label="Total Users" tone="indigo" value={fmtInt(stats.total)} icon={<TeamOutlined />} />
        <Kpi label="Active Users" tone="green" value={fmtInt(stats.active)} icon={<UserOutlined />} />
        <Kpi label="Inactive Users" tone="red" value={fmtInt(stats.inactive)} icon={<UserDeleteOutlined />} />
        <Kpi label="Total Accounts" tone="blue" value={fmtInt(stats.totalAccounts)} icon={<AppstoreOutlined />} />
      </div>

      <div className="panel">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={users}
          columns={columns as any}
          pagination={{
            current: page,
            pageSize: pageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '25', '50'],
            locale: { items_per_page: '/ page' },
            showTotal: (total, range) => `Showing ${range[0]} to ${range[1]} of ${total} members`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
            onShowSizeChange: (_, ps) => { setPage(1); setPageSize(ps); },
          }}
        />
      </div>

      <Modal
        title={mode === 'add' ? 'Add User' : `Edit ${editing?.email ?? ''}`}
        open={mode !== null}
        onCancel={close}
        onOk={submit}
        okText={mode === 'add' ? 'Add User' : 'Save'}
        confirmLoading={submitting}
        okButtonProps={{ className: 'btn-primary-gradient' }}
        width={620}
        destroyOnClose
      >
        <p style={{ color: '#64748b', marginTop: -4, marginBottom: 16 }}>
          {mode === 'add'
            ? 'Create a new user account. They can log in immediately.'
            : 'Update the accounts allocated to this user.'}
        </p>
        <Form form={form} layout="vertical" requiredMark={false}>
          <div className="form-grid">
            <Form.Item
              className="form-field"
              label="Email"
              name="email"
              rules={[{ required: true, message: 'Email is required' }, { type: 'email', message: 'Enter a valid email' }]}
            >
              <Input prefix={<MailOutlined />} placeholder="Enter email address" disabled={mode === 'edit'} />
            </Form.Item>
            <Form.Item
              className="form-field"
              label="Username"
              name="username"
              rules={[{ required: mode === 'add', message: 'Username is required' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="Enter username" disabled={mode === 'edit'} />
            </Form.Item>
            {mode === 'add' && (
              <Form.Item
                className="form-field full"
                label="Password"
                name="password"
                rules={[{ required: true, message: 'Password is required' }, { min: 8, message: 'At least 8 characters' }]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="Enter password" />
              </Form.Item>
            )}
            <Form.Item className="form-field full" label="Allocate Accounts" name="accountCids">
              <Select
                mode="multiple"
                placeholder="Choose accounts"
                options={accountOptions}
                optionFilterProp="label"
                showSearch
                maxTagCount="responsive"
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

    </div>
  );
}
