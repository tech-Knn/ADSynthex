import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getCustomerForAccount } from '@/lib/google-ads-api';
import { resolveMccKeyForFeed, registerAccountMCC } from '@/lib/mcc-config';
import { enums } from 'google-ads-api';
import sharp from 'sharp';
import { buildCreative, generateLogoPng } from '@/lib/ad-creative';
import { getAccountsForUser } from '@/lib/account-scope';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SETUP_KEY = 'default_launch_setup';
const CTA_LABEL: Record<string, string> = { LEARN_MORE: 'Learn more', SHOP_NOW: 'Shop now', SIGN_UP: 'Sign up', DOWNLOAD: 'Download', SUBSCRIBE: 'Subscribe', GET_QUOTE: 'Get quote', BOOK_NOW: 'Book now' };

function gErr(e: any): string {
  const errs = e?.errors || e?.failure?.errors;
  if (Array.isArray(errs) && errs.length) {
    return errs.map((f: any) => {
      const path = (f.location?.field_path_elements || []).map((p: any) => p.field_name).filter(Boolean).join(' → ');
      const code = f.error_code ? JSON.stringify(f.error_code) : '';
      return `${f.message || 'error'}${path ? ` [field: ${path}]` : ''}${code ? ' ' + code : ''}`.trim();
    }).join(' | ');
  }
  return e?.message || String(e);
}
const gaqlEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function toBuffer(src: string): Promise<Buffer> {
  if (src.startsWith('data:')) return Buffer.from(src.split(',')[1] || '', 'base64');
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let customer: any = null, budgetRN: string | undefined, campaignRN: string | undefined, adGroupRN: string | undefined;

  try {
    const { articleUrl, articleTitle, country, finalUrl, images } = await req.json();
    if (!articleUrl) return NextResponse.json({ error: 'articleUrl is required' }, { status: 400 });
    if (!finalUrl || !String(finalUrl).trim()) return NextResponse.json({ error: 'finalUrl is required' }, { status: 400 });
    const imgs: string[] = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!imgs.length) return NextResponse.json({ error: 'At least one image is required' }, { status: 400 });

    const row = await prisma.appSetting.findUnique({ where: { key: SETUP_KEY } });
    const setup = row?.value ? JSON.parse(row.value) : null;
    if (!setup?.adAccount) return NextResponse.json({ error: 'No ad account in saved setup. Pick an account and click Save setup.' }, { status: 400 });

    const accountCid = String(setup.adAccount);
    // non-admins may only launch into their assigned accounts
    if (session.role !== 'admin') {
      const mine = await getAccountsForUser((session as any).userId, session.role);
      if (!mine.includes(accountCid)) {
        return NextResponse.json({ error: 'You are not assigned to this ad account.' }, { status: 403 });
      }
    }
    const ctry = country || setup.defaultCountry || 'US';
    const topic = String(articleTitle || '').slice(0, 60) || 'Untitled';
    const businessName = setup.businessName || 'AndroidAdvice';
    const campaignName = String(setup.nameTemplate || '{topic} Demand Gen - {country}').replace('{topic}', topic).replace('{country}', ctry);
    const cta = CTA_LABEL[setup.cta] || 'Learn more';

    // ---- DEDUP ----
    const existing = await prisma.launchedCampaign.findUnique({ where: { articleUrl_accountCid: { articleUrl, accountCid } } });
    if (existing) {
      return NextResponse.json({ ok: true, alreadyLaunched: true, account: accountCid, country: existing.country, campaignId: existing.campaignId, campaignResourceName: existing.resourceName, campaignName: existing.campaignName, note: `Already launched in account ${accountCid} (${existing.country}).` });
    }

    const acct = await prisma.account.findUnique({ where: { cid: accountCid }, select: { feedName: true } });
    const mccKey = resolveMccKeyForFeed(acct?.feedName);
    if (mccKey) registerAccountMCC(accountCid, mccKey);
    customer = getCustomerForAccount(accountCid);

    // 1) budget
    const budgetRes = await customer.campaignBudgets.create([{ name: `Budget - ${campaignName} - ${Date.now()}`, amount_micros: Math.round((Number(setup.budget) || 5) * 1_000_000), delivery_method: enums.BudgetDeliveryMethod.STANDARD, explicitly_shared: false }]);
    budgetRN = budgetRes.results?.[0]?.resource_name;

    // 2) campaign (PAUSED) — adopt if the name already exists
    try {
      const campaignRes = await customer.campaigns.create([{
        name: campaignName, status: enums.CampaignStatus.PAUSED, advertising_channel_type: enums.AdvertisingChannelType.DEMAND_GEN,
        campaign_budget: budgetRN, maximize_conversions: {},
        contains_eu_political_advertising: enums.EuPoliticalAdvertisingStatus.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING,
      }]);
      campaignRN = campaignRes.results?.[0]?.resource_name;
    } catch (ce: any) {
      if (/DUPLICATE_CAMPAIGN_NAME/.test(gErr(ce))) {
        try { if (budgetRN) await customer.campaignBudgets.remove([budgetRN]); } catch { }
        budgetRN = undefined;
        const found = await customer.query(`SELECT campaign.id, campaign.resource_name FROM campaign WHERE campaign.name = '${gaqlEscape(campaignName)}' LIMIT 1`);
        const ex = found?.[0]?.campaign;
        if (ex?.id) {
          await prisma.launchedCampaign.upsert({ where: { articleUrl_accountCid: { articleUrl, accountCid } }, update: {}, create: { articleUrl, articleTitle: articleTitle || null, feed: setup.feed || '', accountCid, country: ctry, campaignId: String(ex.id), campaignName, resourceName: ex.resource_name, launchedBy: (session as any).email ?? null } });
          return NextResponse.json({ ok: true, alreadyLaunched: true, adopted: true, account: accountCid, country: ctry, campaignId: String(ex.id), campaignResourceName: ex.resource_name, campaignName, note: 'A campaign with this name already existed — recorded it instead of duplicating.' });
        }
      }
      throw ce;
    }
    if (!campaignRN) throw new Error('Campaign creation returned no resource name');

    // 3) ad group — apply channel selection from setup.
    // setup.channels is an object of booleans with the UI's camelCase keys:
    // { ytInStream, ytInFeed, ytShorts, discover, gmail, display, maps }
    const chSel: Record<string, boolean> = (setup.channels && typeof setup.channels === 'object') ? setup.channels : {};
    const chFlags = {
      youtube_in_stream: !!chSel.ytInStream,
      youtube_in_feed: !!chSel.ytInFeed,
      youtube_shorts: !!chSel.ytShorts,
      discover: !!chSel.discover,
      gmail: !!chSel.gmail,
      display: !!chSel.display,
      // setup also has a "maps" checkbox, but Demand Gen's selected_channels has no maps field — ignored.
    };
    const anyChannel = Object.values(chFlags).some(Boolean);

    const adGroupRes = await customer.adGroups.create([{
      name: `${topic} - Ad group`,
      campaign: campaignRN,
      status: enums.AdGroupStatus.ENABLED,
      // only set channel_controls when the buyer actually picked channels;
      // an all-false set is rejected, and omitting it = Google's "all channels" default
      ...(anyChannel ? { demand_gen_ad_group_settings: { channel_controls: { selected_channels: chFlags } } } : {}),
    }]);
    adGroupRN = adGroupRes.results?.[0]?.resource_name;

    // 4) geo targeting — Demand Gen requires location at the AD GROUP level, not the campaign.
    const countryCode = String(ctry || '').trim().toUpperCase();
    const geoRows = await prisma.$queryRaw<{ geo_id: string | number }[]>`
      SELECT geo_id FROM geo_countries WHERE country_code = ${countryCode} LIMIT 1`;
    const geoId = geoRows?.[0]?.geo_id;
    if (!geoId) {
      throw new Error(`No geo_id for country_code "${countryCode}" in geo_countries — aborting (would default to All countries).`);
    }
    await customer.adGroupCriteria.create([{
      ad_group: adGroupRN,
      location: { geo_target_constant: `geoTargetConstants/${String(geoId).trim()}` },
    }]);

    // 5) ad copy (cached from the preview, or generated now)
    const cacheRow = await prisma.appSetting.findUnique({ where: { key: 'creative:' + articleUrl } });
    const creative = cacheRow?.value ? JSON.parse(cacheRow.value) : await buildCreative({ title: topic, articleUrl, businessName, cta });

    // Demand Gen limits: headline ≤ 40 chars, description ≤ 90 chars.
    // Trim each (and drop empties/dupes) so a long auto headline can't fail the whole launch.
    const clamp = (arr: any[], max: number) =>
      Array.from(new Set(
        (arr || [])
          .map((t) => String(t ?? '').trim())
          .filter(Boolean)
          .map((t) => (t.length > max ? t.slice(0, max).trim() : t))
      ));

    const headlines = clamp(creative.headlines, 40).slice(0, 5);
    const descriptions = clamp(creative.descriptions, 90).slice(0, 5);
    if (!headlines.length || !descriptions.length) throw new Error('No ad copy available (headlines/descriptions).');

    // 6) process images + logo → upload all as image assets in one call
    const processed: { buf: Buffer; kind: 'mkt' | 'sq' | 'logo' }[] = [];
    for (const src of imgs.slice(0, 5)) {
      const buf = await toBuffer(src);
      processed.push({ buf: await sharp(buf).resize(1200, 628, { fit: 'cover', position: 'centre' }).png().toBuffer(), kind: 'mkt' });
      processed.push({ buf: await sharp(buf).resize(1200, 1200, { fit: 'cover', position: 'centre' }).png().toBuffer(), kind: 'sq' });
    }
    processed.push({ buf: await generateLogoPng(creative.logoInitial || businessName[0] || 'A', creative.logoColor || 'hsl(220,55%,42%)', 1200), kind: 'logo' });

    const assetRes = await customer.assets.create(processed.map((p, i) => ({ name: `adsx-${Date.now()}-${i}`, type: enums.AssetType.IMAGE, image_asset: { data: p.buf } })));
    const assetRNs = (assetRes.results || []).map((r: any) => r.resource_name);
    const marketingRNs: string[] = [], squareRNs: string[] = [];
    let logoRN = '';
    processed.forEach((p, i) => { const rn = assetRNs[i]; if (!rn) return; if (p.kind === 'mkt') marketingRNs.push(rn); else if (p.kind === 'sq') squareRNs.push(rn); else logoRN = rn; });

    // 7) create the Demand Gen ad
    await customer.adGroupAds.create([{
      ad_group: adGroupRN,
      status: enums.AdGroupAdStatus.ENABLED,
      ad: {
        final_urls: [String(finalUrl).trim()],
        demand_gen_multi_asset_ad: {
          marketing_images: marketingRNs.map(rn => ({ asset: rn })),
          square_marketing_images: squareRNs.map(rn => ({ asset: rn })),
          logo_images: [{ asset: logoRN }],
          headlines: headlines.map((t: string) => ({ text: t })),
          descriptions: descriptions.map((t: string) => ({ text: t })),
          business_name: businessName,
          call_to_action_text: cta,
        },
      },
    }]);

    // 8) record (only after the ad succeeds)
    try {
      await prisma.launchedCampaign.create({ data: { articleUrl, articleTitle: articleTitle || null, feed: setup.feed || '', accountCid, country: ctry, campaignId: String(campaignRN.split('/').pop()), campaignName, resourceName: campaignRN, launchedBy: (session as any).email ?? null } });
    } catch (recErr) { console.error('Failed to record launch:', recErr); }

    return NextResponse.json({ ok: true, paused: true, account: accountCid, country: ctry, campaignId: String(campaignRN.split('/').pop()), campaignName, campaignResourceName: campaignRN, adGroupResourceName: adGroupRN, note: 'Created PAUSED, with ad.' });
  } catch (e: any) {
    try { if (customer && adGroupRN) await customer.adGroups.remove([adGroupRN]); } catch { }
    try { if (customer && campaignRN) await customer.campaigns.remove([campaignRN]); } catch { }
    try { if (customer && budgetRN) await customer.campaignBudgets.remove([budgetRN]); } catch { }
    return NextResponse.json({ error: gErr(e), rolledBack: !!(budgetRN || campaignRN || adGroupRN) }, { status: 500 });
  }
}