'use client';
import React, { useEffect, useState } from 'react';
import { Modal, Spin, Tag } from 'antd';

type Creative = { headlines: string[]; descriptions: string[]; businessName: string; cta: string; logoInitial: string; logoColor: string; imageUrl: string | null };

export default function CreativePreview({ article, onClose }: { article: { title: string; url: string } | null; onClose: () => void }) {
  const [creative, setCreative] = useState<Creative | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!article) { setCreative(null); return; }
    setLoading(true);
    fetch(`/api/ad-launcher/creative?articleUrl=${encodeURIComponent(article.url)}&title=${encodeURIComponent(article.title)}`)
      .then(r => r.json()).then(d => setCreative(d.creative || null)).catch(() => {}).finally(() => setLoading(false));
  }, [article]);

  return (
    <Modal open={!!article} onCancel={onClose} footer={null} width={720}>
      {loading && <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>}
      {!loading && creative && article && (
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1, color: '#6d28d9', fontWeight: 700 }}>AUTO-GENERATED CREATIVE</div>
          <div style={{ fontSize: 18, fontWeight: 700, margin: '4px 0 10px' }}>{article.title}</div>
          <div style={{ background: '#f6f6fb', border: '1px solid #ececf1', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#64748b', marginBottom: 16 }}>
            Generated automatically from the article + your default setup — nothing typed by hand.
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', minWidth: 260 }}>
              <Section label="LOGO" sub="auto square PNG">
                <div style={{ width: 84, height: 84, borderRadius: 10, background: creative.logoColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700 }}>{creative.logoInitial}</div>
              </Section>
              <Section label="HEADLINES" sub="auto from article">
                {creative.headlines.map((h, i) => <Chip key={i}>{h}</Chip>)}
              </Section>
              <Section label="DESCRIPTIONS" sub="auto from article">
                {creative.descriptions.map((d, i) => <Chip key={i}>{d}</Chip>)}
              </Section>
            </div>
            <div style={{ flex: '1 1 280px', minWidth: 260 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, color: '#8a8a99', fontWeight: 700, marginBottom: 8 }}>AD PREVIEW</div>
              <div style={{ border: '1px solid #ececf1', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ height: 180, background: creative.imageUrl ? `center/cover no-repeat url(${creative.imageUrl})` : 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'monospace', fontSize: 12 }}>
                  {!creative.imageUrl && 'Image · gradient (no og:image)'}
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: creative.logoColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{creative.logoInitial}</div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{creative.businessName}</span>
                    <Tag style={{ marginLeft: 'auto' }}>Ad</Tag>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{creative.headlines[0]}</div>
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>{creative.descriptions[0]}</div>
                  <div style={{ background: '#4f46e5', color: '#fff', textAlign: 'center', padding: '8px 0', borderRadius: 8, fontWeight: 600 }}>{creative.cta}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Section({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.5, color: '#8a8a99', fontWeight: 700, marginBottom: 6 }}>{label} {sub && <span style={{ fontWeight: 400 }}>· {sub}</span>}</div>
      {children}
    </div>
  );
}
function Chip({ children }: { children: React.ReactNode }) {
  return <div style={{ border: '1px solid #ececf1', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 8 }}>{children}</div>;
}