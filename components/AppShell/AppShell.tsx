'use client';

import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Dropdown, Button } from 'antd';
import {
  DashboardOutlined,
  BarChartOutlined,
  TeamOutlined,
  SettingOutlined,
  LogoutOutlined,
  BellOutlined,
  UserOutlined,
  CalendarOutlined,
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import AsxLogo from './AsxLogo';

type NavItem = { key: string; label: string; href: string; icon: ReactNode; adminOnly?: boolean };

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: <DashboardOutlined /> },
  { key: 'breakdown', label: 'Breakdown', href: '/dashboard/breakdown', icon: <CalendarOutlined /> },
  { key: 'campaigns', label: 'Campaigns', href: '/campaigns', icon: <BarChartOutlined /> },
  { key: 'manage-team', label: 'Manage Team', href: '/manage-team', icon: <TeamOutlined />, adminOnly: true },
];

interface MeUser {
  id: string;
  email: string;
  username: string | null;
  role: 'admin' | 'user';
}

type Notification = {
  id: string;
  level: 'danger' | 'warn';
  title: string;
  description: string;
  campaignId: string;
  accountCid: string;
  date: string;
};

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [notifs, setNotifs] = useState<Notification[]>([]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setMe(d.user || null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/notifications')
        .then((r) => r.ok ? r.json() : { notifications: [] })
        .then((d) => { if (!cancelled) setNotifs(d.notifications || []); })
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const visibleNav = useMemo(
    () => NAV.filter((n) => !n.adminOnly || me?.role === 'admin'),
    [me],
  );

  const activeKey =
    visibleNav.slice()
      .sort((a, b) => b.href.length - a.href.length)
      .find((n) => pathname === n.href || pathname.startsWith(n.href + '/'))?.key ?? 'dashboard';

  const unread = notifs.length;

  return (
    <div className="appshell">
      <aside className="appshell-sidebar">
        <div className="appshell-brand">
          <AsxLogo size={32} />
          <span className="appshell-brand-name">AdSynthe<span className="brand-x">X</span></span>
        </div>

        <nav className="appshell-nav">
          {visibleNav.map((item) => {
            const active = item.key === activeKey;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`appshell-nav-item${active ? ' active' : ''}`}
              >
                <span className="appshell-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="appshell-sidebar-footer">
          <Link href="/settings" className="appshell-nav-item">
            <span className="appshell-nav-icon"><SettingOutlined /></span>
            <span>Settings</span>
          </Link>
          <button
            type="button"
            className="appshell-nav-item"
            onClick={() => router.push('/logout')}
          >
            <span className="appshell-nav-icon"><LogoutOutlined /></span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="appshell-main">
        <header className="appshell-topbar">
          <div className="appshell-topbar-right">
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              dropdownRender={() => <NotificationsPanel notifs={notifs} />}
            >
              <button type="button" className="appshell-icon-btn" aria-label="Notifications">
                <BellOutlined />
                {unread > 0 && <span className="bell-dot">{unread > 99 ? '99+' : unread}</span>}
              </button>
            </Dropdown>
            <div className="appshell-user">
              <div className="appshell-user-avatar">
                <UserOutlined />
              </div>
              <div className="appshell-user-meta">
                <span className="appshell-user-name">{me?.username || me?.email || 'User'}</span>
                <span className="appshell-user-role">{me?.role === 'admin' ? 'Admin' : 'User'}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="appshell-content">{children}</main>
      </div>
    </div>
  );
}

function NotificationsPanel({ notifs }: { notifs: Notification[] }) {
  return (
    <div className="notif-popover" style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--asx-border)', boxShadow: '0 20px 40px -16px rgba(15, 23, 42, 0.15)' }}>
      <div className="notif-head">
        <div>
          <div className="notif-head-title">Notifications</div>
          <div className="notif-head-sub">{notifs.length ? `${notifs.length} alerts in last 24h` : 'No alerts in last 24h'}</div>
        </div>
      </div>
      {notifs.length === 0 ? (
        <div className="notif-empty">
          <CheckCircleOutlined style={{ fontSize: 22, color: 'var(--asx-success)', marginBottom: 6, display: 'block' }} />
          You're all caught up
        </div>
      ) : (
        <div className="notif-list">
          {notifs.map((n) => (
            <div key={n.id} className="notif-item">
              <span className={`notif-dot ${n.level}`} />
              <div className="notif-body">
                <div className="notif-title">
                  <WarningOutlined style={{ color: n.level === 'danger' ? 'var(--asx-danger)' : 'var(--asx-warn)', marginRight: 6 }} />
                  {n.title}
                </div>
                <div className="notif-desc">{n.description}</div>
                <div className="notif-meta">{n.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
