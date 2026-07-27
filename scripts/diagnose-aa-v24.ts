// Pinpoint why AndroidAdvice "Active Campaigns" returns 0 items under v24.
// Tests three queries against the same account to isolate the cause:
//   1. The full field list the dashboard uses, dated TODAY.
//   2. A minimal field set (id + cost + impressions), dated TODAY.
//   3. The minimal set dated YESTERDAY.
//
// Interpretation:
//   - All three return 0 → v24 changed something fundamental; investigate further.
//   - (1) returns 0 but (2)/(3) work → a specific field in the full SELECT is now
//     invalid in v24; rip it out of lib/google-ads-config.js.
//   - (1)/(2) return 0 but (3) returns rows → it's a "today has no data yet"
//     timing issue, not a code bug; v24 is fine to ship.
//
// Run: `npx tsx scripts/diagnose-aa-v24.ts`
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const TEST_ACCOUNTS = [
    { id: '8701280199', name: 'androidadvices 01' },
    { id: '8182947427', name: 'androidadvices 07' }, // had 9 campaigns per geo-targets
    { id: '7753453760', name: 'androidadvice 09' },  // active per dashboard
];

function fmt(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function run() {
    const today = fmt(new Date());
    const yesterday = fmt(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const { GoogleAdsApi } = await import('google-ads-api');
    const { MCC_CONFIGS } = await import('../lib/mcc-config');
    const { getMCCForAccount, getDefaultMCC } = await import('../lib/mcc-config');

    const fullQuery = (start: string, end: string) => `
        SELECT
            campaign.id, campaign.name, campaign.status, campaign.final_url_suffix,
            customer.currency_code, segments.date,
            metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
            metrics.cost_per_conversion, metrics.all_conversions, metrics.ctr,
            metrics.average_cpc, metrics.average_cost, metrics.average_target_cpa_micros
        FROM campaign
        WHERE campaign.status IN ('ENABLED', 'PAUSED')
        AND segments.date BETWEEN '${start}' AND '${end}'
    `;

    const minQuery = (start: string, end: string) => `
        SELECT campaign.id, metrics.cost_micros, metrics.impressions
        FROM campaign
        WHERE segments.date BETWEEN '${start}' AND '${end}'
    `;

    for (const acc of TEST_ACCOUNTS) {
        console.log(`\n===== ${acc.name} (${acc.id}) =====`);

        const mccCreds = getMCCForAccount(acc.id) || getDefaultMCC();
        const client = new GoogleAdsApi({
            client_id: mccCreds.googleAds.clientId,
            client_secret: mccCreds.googleAds.clientSecret,
            developer_token: mccCreds.googleAds.developerToken,
        });
        const customer = client.Customer({
            customer_id: acc.id,
            refresh_token: mccCreds.googleAds.refreshToken,
            login_customer_id: mccCreds.mccId,
        });

        const tests: Array<{ label: string; query: string }> = [
            { label: `(1) Full field list, TODAY (${today})`, query: fullQuery(today, today) },
            { label: `(2) Minimal fields,  TODAY (${today})`, query: minQuery(today, today) },
            { label: `(3) Minimal fields,  YESTERDAY (${yesterday})`, query: minQuery(yesterday, yesterday) },
        ];

        for (const t of tests) {
            try {
                const start = Date.now();
                const response = await customer.query(t.query);
                const ms = Date.now() - start;
                let cost = 0;
                let impressions = 0;
                for (const r of response as any[]) {
                    cost += (r.metrics?.cost_micros || 0) / 1_000_000;
                    impressions += r.metrics?.impressions || 0;
                }
                console.log(`${t.label}: ${response.length} rows, $${cost.toFixed(2)} cost, ${impressions} imps (${ms}ms)`);
            } catch (e: any) {
                console.error(`${t.label}: ERROR — ${e?.message || JSON.stringify(e).substring(0, 200)}`);
            }
        }
    }

    console.log('\nDone.');
    process.exit(0);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
