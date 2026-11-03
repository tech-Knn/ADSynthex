'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Select, Input, InputNumber, Checkbox, Switch, Button, Spin, message } from 'antd';

type Account = { cid: string; seq: number | null; feedName: string };
type Country = { geoId: string; code: string };
type Conversion = { id: string; name: string; category?: string };
type Setup = {
    objective: string; goal: string; campaignGoal: string; adType: string;
    feed: string; adAccount: string | null; budget: number;
    businessName: string; cta: string; conversion: string | null;
    nameTemplate: string; defaultCountry: string | null;
    channels: Record<string, boolean>; optimized: boolean;
};

const OBJECTIVES = { LEADS: 'Leads', SALES: 'Sales', TRAFFIC: 'Website traffic', AWARENESS: 'Awareness & consideration' };
const GOALS = { OUTBOUND_CLICKS: 'Outbound clicks', SIGNUPS: 'Sign ups', PURCHASES: 'Purchases', PAGEVIEWS: 'Page views' };
const CGOALS = { CONVERSIONS: 'Conversions', CLICKS: 'Clicks', VALUE: 'Conversion value' };
const ADTYPES = { VIDEO: 'Video', IMAGE: 'Image' };
const CTAS = { AUTOMATED: 'Automated', LEARN_MORE: 'Learn more', SIGN_UP: 'Sign up', GET_QUOTE: 'Get quote', APPLY_NOW: 'Apply now', SUBSCRIBE: 'Subscribe' };
const FEED_PREFIX: Record<string, string> = { androidadvice: 'androidadvices', founderzest: 'fdz' };
const CHANNELS: [string, string][] = [
    ['ytInStream', 'YouTube in-stream'], ['ytInFeed', 'YouTube in-feed'], ['ytShorts', 'YouTube Shorts'],
    ['discover', 'Discover'], ['gmail', 'Gmail'], ['display', 'Display'], ['maps', 'Maps'],
];

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));
const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase' as const, color: '#64748b', display: 'block', marginBottom: 5 };

export default function DefaultLaunchSetup() {
    const [setup, setSetup] = useState<Setup | null>(null);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [countries, setCountries] = useState<Country[]>([]);
    const [conversions, setConversions] = useState<Conversion[]>([]);
    const [loading, setLoading] = useState(true);
    const [convLoading, setConvLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch('/api/ad-launcher/setup').then((r) => r.json()).then((s) => setSetup(s.setup)).catch(() => { }).finally(() => setLoading(false));
        fetch('/api/ad-launcher/countries').then((r) => r.json()).then((d) => setCountries(d.countries || [])).catch(() => { });
    }, []);

    // accounts reload when the feed/account-group changes
    useEffect(() => {
        if (!setup?.feed) return;
        fetch(`/api/ad-launcher/accounts?feed=${encodeURIComponent(setup.feed)}`)
            .then((r) => r.json()).then((d) => setAccounts(d.accounts || [])).catch(() => setAccounts([]));
    }, [setup?.feed]);

    // conversion actions when the ad account changes
    useEffect(() => {
        if (!setup?.adAccount) { setConversions([]); return; }
        setConvLoading(true);
        fetch(`/api/ad-launcher/conversions?account=${encodeURIComponent(setup.adAccount)}`)
            .then((r) => r.json()).then((d) => setConversions(d.conversions || [])).catch(() => setConversions([]))
            .finally(() => setConvLoading(false));
    }, [setup?.adAccount]);

    const set = <K extends keyof Setup>(k: K, v: Setup[K]) => setSetup((p) => (p ? { ...p, [k]: v } : p));

    const regionNames = useMemo(() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } }, []);
    const accountOptions = useMemo(() => accounts.map((a) => {
        const prefix = FEED_PREFIX[a.feedName] || a.feedName;
        const label = a.seq != null ? `${prefix} ${String(a.seq).padStart(2, '0')} (${a.cid})` : a.cid;
        return { value: a.cid, label };
    }), [accounts]);
    const countryOptions = useMemo(() => countries.map((c) => {
        let name = c.code; try { name = regionNames?.of(c.code) || c.code; } catch { }
        return { value: c.code, label: name };
    }).sort((a, b) => a.label.localeCompare(b.label)), [countries, regionNames]);
    const conversionOptions = useMemo(() => conversions.map((c) => ({ value: c.id, label: c.name })), [conversions]);

    const save = async () => {
        if (!setup) return;
        setSaving(true);
        try {
            const res = await fetch('/api/ad-launcher/setup', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...setup, objective: 'LEADS', adType: 'IMAGE', bidStrategy: 'MAXIMIZE_CONVERSIONS', businessName: 'AndroidAdvice' }),
            });
            if (!res.ok) throw new Error();
            message.success('Launch setup saved');
        } catch { message.error('Could not save setup'); }
        finally { setSaving(false); }
    };

    if (loading || !setup) return <div className="panel" style={{ padding: 48, textAlign: 'center' }}><Spin /></div>;

    const chip = (label: string, node: React.ReactNode) => (
        <div style={{ background: '#f8fafc', padding: '9px 10px', borderRadius: 8, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94a3b8' }}>{label}</div>
            <div style={{ marginTop: 3 }}>{node}</div>
        </div>
    );
    const bare = { border: 'none', boxShadow: 'none', fontWeight: 700, padding: 0 };

    return (
        <div className="panel" style={{ maxWidth: 560, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Default launch setup</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Shared by the whole team. Saved to your account defaults.</div>
                </div>
                <Button type="primary" loading={saving} onClick={save}>Save setup</Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: '#e2e8f0', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                {chip('Objective', <div style={{ fontWeight: 700, fontSize: 12.5 }}>Leads</div>)}
                {chip('Goal', <Select size="small" variant="borderless" style={{ width: '100%', ...bare }} value={setup.goal} options={opts(GOALS)} onChange={(v) => set('goal', v)} />)}
                {chip('Camp. type', <div style={{ fontWeight: 700, fontSize: 12.5, color: '#4f46e5' }}>Demand Gen</div>)}
                {chip('Camp. goal', <Select size="small" variant="borderless" style={{ width: '100%', ...bare }} value={setup.campaignGoal} options={opts(CGOALS)} onChange={(v) => set('campaignGoal', v)} />)}
                {chip('Ad type', <div style={{ fontWeight: 700, fontSize: 12.5 }}>Image</div>)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div><label style={lbl}>Account group</label>
                    <Select style={{ width: '100%' }} value={setup.feed} options={opts(FEED_PREFIX)}
                        onChange={(v) => setSetup((p) => (p ? { ...p, feed: v, adAccount: null, conversion: null } : p))} />
                </div>
                <div><label style={lbl}>Ad account</label>
                    <Select style={{ width: '100%' }} showSearch optionFilterProp="label" placeholder="Select account"
                        value={setup.adAccount ?? undefined} options={accountOptions} onChange={(v) => set('adAccount', v)} />
                </div>
                <div><label style={lbl}>Budget / day ($)</label><InputNumber style={{ width: '100%' }} min={1} step={0.5} value={setup.budget} onChange={(v) => set('budget', Number(v) || 0)} /></div>
                <div><label style={lbl}>Bidding strategy</label><Input value="Maximize conversions" disabled /></div>
                <div><label style={lbl}>Business name</label><Input value="AndroidAdvice" disabled /></div>
                <div><label style={lbl}>CTA</label><Select style={{ width: '100%' }} value={setup.cta} options={opts(CTAS)} onChange={(v) => set('cta', v)} /></div>
            </div>

            {setup.goal !== 'OUTBOUND_CLICKS' && (
                <div style={{ marginTop: 14 }}>
                    <label style={lbl}>Website / conversion action</label>
                    <Select style={{ width: '100%' }} loading={convLoading} placeholder={setup.adAccount ? 'Select a conversion action' : 'Pick an ad account first'}
                        value={setup.conversion ?? undefined} options={conversionOptions} onChange={(v) => set('conversion', v)}
                        notFoundContent={convLoading ? <Spin size="small" /> : 'No conversion actions found'} />
                </div>
            )}

            <div style={{ marginTop: 14, fontSize: 11.5, color: '#64748b', background: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 9, padding: '9px 11px', lineHeight: 1.5 }}>
                <b>Logo:</b> a distinct square PNG is generated automatically for every campaign. <b>Headlines &amp; descriptions:</b> auto-written per article.
            </div>

            <div style={{ marginTop: 14 }}>
                <label style={lbl}>Campaign name template</label>
                <Input value={setup.nameTemplate} onChange={(e) => set('nameTemplate', e.target.value)} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Placeholders: {'{topic}'} · {'{country}'}</div>
            </div>

            <div style={{ marginTop: 14 }}>
                <label style={lbl}>Default country</label>
                <Select style={{ width: '100%' }} showSearch optionFilterProp="label" placeholder="Select country"
                    value={setup.defaultCountry ?? undefined} options={countryOptions} onChange={(v) => set('defaultCountry', v)}
                    notFoundContent={countries.length ? 'No match' : <Spin size="small" />} />
            </div>

            <div style={{ marginTop: 14 }}>
                <label style={lbl}>Channels</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {CHANNELS.map(([k, label]) => (
                        <Checkbox key={k} checked={!!setup.channels[k]} onChange={(e) => set('channels', { ...setup.channels, [k]: e.target.checked })}>{label}</Checkbox>
                    ))}
                </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 13px', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div><div style={{ fontSize: 13, fontWeight: 600 }}>Optimized targeting</div><div style={{ fontSize: 12, color: '#64748b' }}>Let Google expand beyond your segments to find converters.</div></div>
                <Switch checked={setup.optimized} onChange={(v) => set('optimized', v)} />
            </div>
        </div>
    );
}