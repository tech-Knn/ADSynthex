#!/bin/bash
# Local dev cron — har 15 min /api/sync hit karta hai.
# Chalao:  bash scripts/cron-local.sh
# Rokne ke liye: Ctrl+C

INTERVAL=900   # 15 min (seconds). Testing ke liye 300 (5 min) kar sakte ho.
URL="http://localhost:3000/api/sync"

SECRET=$(grep '^CRON_SECRET=' .env | cut -d '=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$SECRET" ]; then
  echo "CRON_SECRET not found in .env"
  exit 1
fi

echo "Cron started — hitting $URL every ${INTERVAL}s"
echo "Press Ctrl+C to stop"
echo ""

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Triggering sync..."
  curl -s -X POST "$URL" -H "Authorization: Bearer $SECRET" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ->', d.get('startDate'), 'to', d.get('endDate'), '| ads:', d.get('adsDailyUpserted'), '| adsense:', d.get('adsenseDailyUpserted'), '| took:', d.get('_tookMs'), 'ms', '| errors:', len(d.get('errors', [])))" 2>/dev/null \
    || echo "  -> failed"
  echo ""
  sleep $INTERVAL
done
