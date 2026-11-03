'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Select, Input, Button, Tag, Spin, Upload, message } from 'antd';
import { ReloadOutlined, UploadOutlined, PictureOutlined } from '@ant-design/icons';
import CreativePreview from './CreativePreview';

const LAUNCH_ENABLED = true;

type Article = { title: string; url: string; slug: string; image: string | null; date: string | null; source: string };
type RowStatus = 'ready' | 'launching' | 'launched' | 'failed';
type Row = Article & { status: RowStatus; campaign?: string; error?: string };
type RowInput = { finalUrl: string; images: { name: string; dataUrl: string }[]; prompt: string; candidates: string[]; generating: boolean };

const EMPTY_INPUT: RowInput = { finalUrl: '', images: [], prompt: '', candidates: [], generating: false };

const FEEDS = [
  { value: 'androidadvice', label: 'AndroidAdvice' },
  { value: 'founderzest', label: 'FounderZest' },
];

const S: Record<string, React.CSSProperties> = {
  wrap: { background: '#fff', border: '1px solid #ececf1', borderRadius: 12, padding: 16 },
  stats: { display: 'flex', gap: 12, marginBottom: 16 },
  stat: { flex: 1, border: '1px solid #f0f0f4', borderRadius: 10, padding: '10px 14px' },
  statN: { fontSize: 22, fontWeight: 700, lineHeight: 1 },
  statL: { fontSize: 11, color: '#8a8a99', letterSpacing: 0.5, marginTop: 6 },
  filters: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 },
  fcol: { display: 'flex', flexDirection: 'column', gap: 4 },
  flabel: { fontSize: 11, color: '#8a8a99', letterSpacing: 0.5 },
  note: { fontSize: 12, color: '#8a8a99', margin: '4px 0 10px' },
  empty: { textAlign: 'center', padding: 48, color: '#8a8a99' },
  row: { borderTop: '1px solid #f0f0f4', padding: '14px 0' },
  rtitle: { fontWeight: 600, fontSize: 14, marginBottom: 2, cursor: 'pointer' },
  rurl: { fontSize: 12, color: '#2563eb', wordBreak: 'break-all', textDecoration: 'none' },
  rmeta: { display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' },
  muted: { fontSize: 12, color: '#8a8a99' },
  campaign: { fontSize: 12, color: '#16a34a', fontFamily: 'monospace', wordBreak: 'break-all' },
  err: { fontSize: 12, color: '#dc2626', wordBreak: 'break-word' },
  fieldLabel: { fontSize: 11, color: '#8a8a99', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  thumbs: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  thumb: { position: 'relative', width: 72, height: 48, borderRadius: 6, overflow: 'hidden', border: '1px solid #e5e7eb' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  thumbX: { position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, lineHeight: '16px', textAlign: 'center', cursor: 'pointer' },
  candGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 8 },
  cand: { position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb', cursor: 'pointer', aspectRatio: '16 / 9' },
  candImg: { width: '100%', height: '100%', objectFit: 'cover' },
  candBadge: { position: 'absolute', top: 4, right: 4, background: '#16a34a', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: 12, lineHeight: '20px', textAlign: 'center' },
};

export default function ArticleQueue() {
  const [feed, setFeed] = useState('androidadvice');
  const [country, setCountry] = useState('US');
  const [account, setAccount] = useState('');
  const [countries, setCountries] = useState<{ geoId: string; code: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [inputs, setInputs] = useState<Record<string, RowInput>>({});
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(null);

  const syncSetup = useCallback(async () => {
    try {
      const d = await fetch('/api/ad-launcher/setup').then(r => r.json());
      if (d?.setup?.feed) setFeed(d.setup.feed);
      if (d?.setup?.defaultCountry) setCountry(d.setup.defaultCountry);
      if (d?.setup?.adAccount) setAccount(String(d.setup.adAccount));
    } catch {}
  }, []);

  useEffect(() => {
    syncSetup();
    fetch('/api/ad-launcher/countries').then(r => r.json()).then(d => setCountries(d.countries || [])).catch(() => {});
  }, [syncSetup]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const aRes = await fetch(`/api/ad-launcher/articles?feed=${feed}`).then(r => r.json());
      if (aRes.error) { message.error(aRes.error); setRows([]); return; }
      let launchedMap = new Map<string, any>();
      if (account) {
        try {
          const lRes = await fetch(`/api/ad-launcher/launched?account=${account}`).then(r => r.json());
          launchedMap = new Map((lRes.launched || []).map((x: any) => [x.articleUrl, x]));
        } catch {}
      }
      setRows((aRes.articles || []).map((a: Article) => {
        const rec = launchedMap.get(a.url);
        return rec ? { ...a, status: 'launched' as RowStatus, campaign: rec.resourceName || rec.campaignId } : { ...a, status: 'ready' as RowStatus };
      }));
    } catch { message.error('Failed to load articles'); }
    finally { setLoading(false); }
  }, [feed, account]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return rows.filter(r => r.title.toLowerCase().includes(q) || r.url.toLowerCase().includes(q));
  }, [rows, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    ready: rows.filter(r => r.status === 'ready').length,
    launched: rows.filter(r => r.status === 'launched').length,
    failed: rows.filter(r => r.status === 'failed').length,
  }), [rows]);

  const countryOptions = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
    return countries.map(c => ({ value: c.code, label: dn?.of(c.code) || c.code })).sort((a, b) => a.label.localeCompare(b.label));
  }, [countries]);

  const getInput = (url: string): RowInput => inputs[url] || EMPTY_INPUT;
  const patchInput = (url: string, patch: Partial<RowInput>) => setInputs(s => ({ ...s, [url]: { ...(s[url] || EMPTY_INPUT), ...patch } }));

  const addImage = (url: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => setInputs(s => {
      const cur = s[url] || EMPTY_INPUT;
      return { ...s, [url]: { ...cur, images: [...cur.images, { name: file.name, dataUrl: String(reader.result) }] } };
    });
    reader.readAsDataURL(file);
  };
  const removeImage = (url: string, idx: number) => setInputs(s => {
    const cur = s[url] || EMPTY_INPUT;
    return { ...s, [url]: { ...cur, images: cur.images.filter((_, i) => i !== idx) } };
  });

  const generateImages = async (url: string) => {
    const inp = getInput(url);
    if (!inp.prompt.trim()) { message.warning('Describe the image first.'); return; }
    patchInput(url, { generating: true, candidates: [] });
    try {
      const res = await fetch('/api/ad-launcher/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: inp.prompt.trim(), n: 4 }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { message.error(d.error || 'Image generation failed'); patchInput(url, { generating: false }); return; }
      patchInput(url, { candidates: d.images || [], generating: false });
    } catch (e: any) { message.error(e?.message || 'Image generation failed'); patchInput(url, { generating: false }); }
  };
  const addCandidate = (url: string, dataUrl: string) => setInputs(s => {
    const cur = s[url] || EMPTY_INPUT;
    if (cur.images.some(i => i.dataUrl === dataUrl)) return s;
    return { ...s, [url]: { ...cur, images: [...cur.images, { name: `gen-${cur.images.length + 1}.png`, dataUrl }] } };
  });
  const addAllCandidates = (url: string) => setInputs(s => {
    const cur = s[url] || EMPTY_INPUT;
    const toAdd = cur.candidates.filter(c => !cur.images.some(i => i.dataUrl === c)).map((c, i) => ({ name: `gen-${cur.images.length + i + 1}.png`, dataUrl: c }));
    return { ...s, [url]: { ...cur, images: [...cur.images, ...toAdd] } };
  });

  const launchOne = async (url: string) => {
    if (!LAUNCH_ENABLED) { message.info('Launching is turned off.'); return; }
    const row = rows.find(r => r.url === url);
    const inp = getInput(url);
    if (!inp.finalUrl.trim()) { message.warning('Enter the Final URL before launching.'); return; }
    if (!inp.images.length) { message.warning('Add at least one image (upload or generate) before launching.'); return; }
    setRows(rs => rs.map(r => r.url === url ? { ...r, status: 'launching', error: undefined } : r));
    try {
      const res = await fetch('/api/ad-launcher/launch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleUrl: url, articleTitle: row?.title, country, finalUrl: inp.finalUrl.trim(), images: inp.images.map(i => i.dataUrl) }),
      });
      const d = await res.json();
      if (!res.ok || d.error) setRows(rs => rs.map(r => r.url === url ? { ...r, status: 'failed', error: d.error || 'Launch failed' } : r));
      else setRows(rs => rs.map(r => r.url === url ? { ...r, status: 'launched', campaign: d.campaignResourceName || d.campaignId } : r));
    } catch (e: any) {
      setRows(rs => rs.map(r => r.url === url ? { ...r, status: 'failed', error: e?.message || 'Launch failed' } : r));
    }
  };

  const onRefresh = () => { syncSetup(); load(); };

  return (
    <div style={S.wrap}>
      <div style={S.stats}>
        <div style={S.stat}><div style={S.statN}>{stats.total}</div><div style={S.statL}>ARTICLES</div></div>
        <div style={S.stat}><div style={{ ...S.statN, color: '#2563eb' }}>{stats.ready}</div><div style={S.statL}>READY</div></div>
        <div style={S.stat}><div style={{ ...S.statN, color: '#16a34a' }}>{stats.launched}</div><div style={S.statL}>LAUNCHED</div></div>
        <div style={S.stat}><div style={{ ...S.statN, color: '#dc2626' }}>{stats.failed}</div><div style={S.statL}>FAILED</div></div>
      </div>

      <div style={S.filters}>
        <div style={S.fcol}><span style={S.flabel}>WEBSITE</span>
          <Select value={feed} onChange={setFeed} options={FEEDS} style={{ width: 170 }} /></div>
        <div style={S.fcol}><span style={S.flabel}>COUNTRY</span>
          <Select showSearch value={country} onChange={setCountry} options={countryOptions} style={{ width: 180 }}
            filterOption={(i, o) => String(o?.label).toLowerCase().includes(i.toLowerCase())} /></div>
        <div style={{ ...S.fcol, flex: 1, minWidth: 220 }}><span style={S.flabel}>SEARCH ARTICLE · type to find the one to launch</span>
          <Input placeholder="Title or URL" value={search} onChange={e => setSearch(e.target.value)} allowClear autoFocus /></div>
        <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>Refresh</Button>
      </div>

      <div style={S.note}>Launched status is tracked per account (any country). Target account: <b>{account || '—'}</b>.</div>

      <div>
        {loading && <div style={S.empty}><Spin /></div>}
        {!loading && !search.trim() && (<div style={S.empty}>Search an article above to set its Final URL, add images, and launch.</div>)}
        {!loading && search.trim() && filtered.length === 0 && (<div style={S.empty}>No article matches “{search}”.</div>)}
        {!loading && filtered.map(r => {
          const inp = getInput(r.url);
          const launched = r.status === 'launched';
          return (
            <div style={S.row} key={r.url}>
              <div style={S.rtitle} onClick={() => setPreview({ title: r.title, url: r.url })}>{r.title}</div>
              <a style={S.rurl} href={r.url} target="_blank" rel="noreferrer">{r.url}</a>
              <div style={S.rmeta}>
                {r.status === 'ready' && <Tag>ready</Tag>}
                {r.status === 'launching' && <Tag color="processing">launching…</Tag>}
                {launched && <Tag color="success">launched</Tag>}
                {r.status === 'failed' && <Tag color="error">failed</Tag>}
                {launched ? <span style={S.campaign}>{r.campaign}</span>
                  : r.status === 'failed' ? <span style={S.err}>{r.error}</span>
                  : <span style={S.muted}>Not launched yet</span>}
              </div>

              {!launched && (
                <>
                  <div style={S.fieldLabel}>FINAL URL · paste channel params from your sheet</div>
                  <Input value={inp.finalUrl} onChange={e => patchInput(r.url, { finalUrl: e.target.value })}
                    placeholder="https://…/?style_id=…&channel_id=…&terms=…" disabled={r.status === 'launching'} />

                  <div style={S.fieldLabel}>IMAGES · upload your own</div>
                  <Upload multiple accept="image/*" showUploadList={false}
                    beforeUpload={(file) => { addImage(r.url, file as File); return false; }}>
                    <Button icon={<UploadOutlined />} size="small" disabled={r.status === 'launching'}>Upload images</Button>
                  </Upload>

                  {inp.images.length > 0 && (
                    <>
                      <div style={S.fieldLabel}>SELECTED IMAGES ({inp.images.length})</div>
                      <div style={S.thumbs}>
                        {inp.images.map((img, i) => (
                          <div style={S.thumb} key={i}>
                            <img src={img.dataUrl} style={S.thumbImg} alt={img.name} />
                            <div style={S.thumbX} onClick={() => removeImage(r.url, i)}>×</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              <Button block style={{ marginTop: 14 }}
                type={launched ? 'default' : 'primary'}
                disabled={!LAUNCH_ENABLED || launched || r.status === 'launching'}
                loading={r.status === 'launching'}
                onClick={() => launchOne(r.url)}>
                {launched ? 'Launched' : 'Launch'}
              </Button>
            </div>
          );
        })}
      </div>

      <CreativePreview article={preview} onClose={() => setPreview(null)} />
    </div>
  );
}