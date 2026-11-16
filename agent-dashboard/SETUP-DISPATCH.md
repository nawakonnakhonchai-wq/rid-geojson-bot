# Dashboard run button gateway

This Worker lets the public GitHub Pages dashboard request the fixed `run_all_repos.yml` workflow without exposing the GitHub token in browser code. The Worker checks the exact Pages origin, requires a separate high-entropy run key, and refuses to queue a second batch while one is queued or running.

## One-time setup

Add these Actions secrets to `nawakonnakhonchai-wq/rid-geojson-bot`:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token scoped to Workers Scripts edit for this account.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
- `GITHUB_DISPATCH_TOKEN`: a fine-grained GitHub token with access only to `rid-geojson-bot` and Actions: write.
- `RUN_KEY`: a randomly generated secret of at least 32 bytes. Keep it private. The dashboard will ask for it once per browser session and keep it only in session storage.

Then run **Deploy dashboard dispatch gateway** from the repository's Actions tab. The job log reports the Worker URL, usually:

`https://rid-geojson-bot-dispatch.<account-subdomain>.workers.dev`

After deployment, put that URL in the dashboard's `DISPATCH_ENDPOINT` setting (the URL plus `/run`) and publish the dashboard update.

Do not paste any of these secret values into source files, issues, or chat. If a secret is exposed, revoke and replace it.
