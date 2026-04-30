# Auto Trader Stock Sync

This site can now rebuild `stock-data.js` from Auto Trader Connect so the homepage and stock page update automatically.

## How It Works

- `tools/autotrader-stock-sync.mjs` authenticates with Auto Trader Connect, pulls paginated stock records, maps them into the existing `window.HDS_STOCK` format, and writes `stock-data.js`.
- `.github/workflows/autotrader-stock-sync.yaml` runs every two hours and commits `stock-data.js` only when the stock has changed.
- The existing IONOS workflow already deploys on push, so a changed stock file should trigger the normal deployment.

Auto Trader's current guidance says API access uses an access token obtained from the Authentication endpoint, that Stock API baselining needs `advertiserId`, `page`, and `pageSize`, and that dealer website Search API calls should use `advertisingLocation=advertiserWebsite` when using Search instead of Stock.

Sources:
- https://help.autotrader.co.uk/hc/en-gb/articles/21791620456221-Integration-Fundamentals
- https://help.autotrader.co.uk/hc/en-gb/articles/21846314775453-Introduction-to-Stock-Sync
- https://help.autotrader.co.uk/hc/en-gb/articles/21946045692445-Introduction-to-Search

## GitHub Setup

Add these repository secrets:

- `AUTOTRADER_API_KEY`
- `AUTOTRADER_API_SECRET`
- `AUTOTRADER_ADVERTISER_ID`

Optional repository variables:

- `AUTOTRADER_API_URL`: defaults to `https://api.autotrader.co.uk`; use `https://api-sandbox.autotrader.co.uk` while testing.
- `AUTOTRADER_SOURCE`: defaults to `stock`; set to `search` if Auto Trader has enabled the Search API for the dealer website feed.
- `AUTOTRADER_ENDPOINT`: overrides the endpoint path if Auto Trader gives you a specific one.
- `AUTOTRADER_EXTRA_QUERY`: extra query parameters, for example `valuations=false&vehicleMetrics=false`.

## Local Testing

Run against a saved JSON feed:

```bash
node tools/autotrader-stock-sync.mjs --input sample-autotrader-feed.json --dry-run
```

Or pipe JSON directly:

```bash
cat sample-autotrader-feed.json | node tools/autotrader-stock-sync.mjs --input - --dry-run
```

Run against Auto Trader directly:

```bash
AUTOTRADER_API_KEY=... AUTOTRADER_API_SECRET=... AUTOTRADER_ADVERTISER_ID=... node tools/autotrader-stock-sync.mjs
```

On PowerShell:

```powershell
$env:AUTOTRADER_API_KEY="..."
$env:AUTOTRADER_API_SECRET="..."
$env:AUTOTRADER_ADVERTISER_ID="..."
node tools/autotrader-stock-sync.mjs
```

## Notes

- Do not put Auto Trader API keys into frontend JavaScript. This integration runs in GitHub Actions so the keys stay in GitHub secrets.
- Manual edits to `stock-data.js` can be overwritten by the next automatic sync. Use Auto Trader as the source of truth once the workflow is configured.
- If a stock record has no usable image URLs, the sync preserves matching local images by stock number, Auto Trader IDs, or registration where possible.
