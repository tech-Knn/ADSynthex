'use client';
import React, { useEffect, useState } from 'react';
import { Button, Tag, Modal, Input, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

type Conn = {
  googleAds: { connected: boolean; label?: string; version?: string; note?: string };
  activeView: { connected: boolean; note?: string };
};

const S: Record<string, React.CSSProperties> = {
  wrap: { background: '#fff', border: '1px solid #ececf1', borderRadius: 12, padding: 16, marginBottom: 16 },
  h: { fontWeight: 700, fontSize: 15, marginBottom: 12 },
  card: { border: '1px solid #f0f0f4', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 },
  name: { fontWeight: 600, fontSize: 14 },
  sub: { fontSize: 12, color: '#8a8a99', marginTop: 2 },
  btns: { display: 'flex', gap: 8, flexWrap: 'wrap' },
};

export default function Connections() {
  const [conn, setConn] = useState<Conn | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => { try { setConn(await fetch('/api/ad-launcher/connections').then(r => r.json())); } catch {} };
  useEffect(() => { load(); }, []);

  const refreshAccounts = async () => {
    setBusy(true);
    try { const d = await fetch('/api/ad-launcher/accounts').then(r => r.json()); message.success(`Refreshed — ${d.accounts?.length ?? 0} accounts`); }
    catch { message.error('Refresh failed'); } finally { setBusy(false); }
  };

  const disconnectGA = () => Modal.confirm({
    title: 'Disconnect Google Ads?',
    content: 'Google Ads is connected with server credentials (API token), managed in your environment config — not from here.',
    okText: 'OK', cancelButtonProps: { style: { display: 'none' } },
  });

  const connectActiveView = () => {
    let key = '';
    Modal.confirm({
      title: 'Connect ActiveView (AdSense)',
      content: <Input placeholder="AdSense revenue-reporting key" onChange={e => { key = e.target.value; }} />,
      okText: 'Connect',
      onOk: async () => {
        await fetch('/api/ad-launcher/connections', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'connectActiveView', key }),
        });
        message.success('ActiveView key saved'); load();
      },
    });
  };

  const ga = conn?.googleAds, av = conn?.activeView;

  return (
    <div style={S.wrap}>
      <div style={S.h}>Connections</div>

      <div style={S.card}>
        <div>
          <div style={S.name}>Google Ads {ga?.connected ? <Tag color="success">Connected</Tag> : <Tag>Not connected</Tag>}</div>
          <div style={S.sub}>{[ga?.label, ga?.version, ga?.note].filter(Boolean).join(' · ') || '—'}</div>
        </div>
        <div style={S.btns}>
          <Button icon={<ReloadOutlined />} onClick={refreshAccounts} loading={busy}>Refresh accounts</Button>
          <Button onClick={load}>Reconnect</Button>
          <Button danger onClick={disconnectGA}>Disconnect</Button>
        </div>
      </div>
    </div>
  );
}