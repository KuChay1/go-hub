# Go Hub — serverless build

Static PWA. No server to run: the browser pulls event/raid/research data straight from ScrapedDuck, and a GitHub Action refreshes `enriched.json` (scraped bonus lists, GO Pass free-vs-Deluxe, news) every 6 hours.

## One-time deploy (free, ~5 minutes)

1. Create a GitHub account if needed, then a new **public** repo (e.g. `go-hub`).
2. Upload everything in this folder to the repo (drag-and-drop on github.com works: "uploading an existing file"). Make sure `.github/workflows/refresh-data.yml` is included — if uploading via the web UI, create that file manually with "Add file → Create new file" and paste its contents, since the drag-and-drop skips dotfolders.
3. Repo **Settings → Pages** → Source: "Deploy from a branch" → Branch: `main`, folder `/ (root)` → Save.
4. Repo **Actions** tab → enable workflows → run "Refresh event data" once manually.
5. Your app is live at `https://<username>.github.io/go-hub/` a minute later.

## On your iPhone

Open that URL in Safari → Share → **Add to Home Screen**. Because it's HTTPS you get the full PWA: home-screen icon, full-screen, offline caching. Works anywhere — no Mac needed.

Not included in this build: push notifications (they require a server — the Mac edition in `../` has them).
