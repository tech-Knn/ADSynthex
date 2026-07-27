// Pulls today's earnings under the androidadvice publisher account broken down by
// DOMAIN_NAME (using the old AFS-compatible dimension set) so we can see whether
// the $1110 is all from androidadvices.com or includes other domains.
import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';

async function main() {
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID!;
  const client = new OAuth2Client({
    clientId: process.env.ANDROIDADVICE_ADSENSE_CLIENT_ID,
    clientSecret: process.env.ANDROIDADVICE_ADSENSE_CLIENT_SECRET,
  });
  client.setCredentials({ refresh_token: process.env.ANDROIDADVICE_ADSENSE_REFRESH_TOKEN });
  const { token } = await client.getAccessToken();

  const today = new Date().toISOString().slice(0, 10);
  const [y, m, d] = today.split('-');

  const url = new URL(`https://adsense.googleapis.com/v2/${publisherId}/reports:generate`);
  url.searchParams.set('dateRange', 'CUSTOM');
  url.searchParams.set('startDate.year', y);
  url.searchParams.set('startDate.month', m);
  url.searchParams.set('startDate.day', d);
  url.searchParams.set('endDate.year', y);
  url.searchParams.set('endDate.month', m);
  url.searchParams.set('endDate.day', d);
  url.searchParams.append('metrics', 'ESTIMATED_EARNINGS');
  // Just DOMAIN_NAME to see all domains under this publisher
  url.searchParams.append('dimensions', 'DOMAIN_NAME');

  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    console.error(await r.text());
    return;
  }
  const j: any = await r.json();
  console.log(`Publisher: ${publisherId}`);
  console.log(`Today: ${today}`);
  console.log(`\nDomain breakdown:`);
  let total = 0;
  for (const row of j.rows || []) {
    const dom = row.cells[0]?.value || '(unset)';
    const earn = parseFloat(row.cells[1]?.value || '0');
    total += earn;
    console.log(`  ${dom.padEnd(40)}  $${earn.toFixed(2)}`);
  }
  console.log(`  ${'TOTAL'.padEnd(40)}  $${total.toFixed(2)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
