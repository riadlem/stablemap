# StableMap Intelligence — Claude Edition

A comprehensive directory and intelligence platform for the digital asset and stablecoin ecosystem. **Powered by Claude AI** (Anthropic).

> Migrated from Google AI Studio (Gemini) → Claude API with production-ready hosting.

---

## Deploy to Vercel (Recommended)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "StableMap Intelligence — Claude Edition"
git remote add origin https://github.com/YOUR_USERNAME/stablemap-intelligence.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Vercel auto-detects Vite — no config needed
4. **Add your API key** in **Settings → Environment Variables**:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-...` (your key from [console.anthropic.com](https://console.anthropic.com))
5. Click **Deploy**

That's it. Your app will be live at `https://your-project.vercel.app`.

### How it works

```
Browser → /api/claude → Vercel Edge Function → Anthropic API
              ↑
     API key lives here (server-side only, never sent to browser)
```

The `api/claude.js` serverless function proxies requests to Anthropic. Your API key is stored as a Vercel environment variable — it never reaches the client.

---

## Deploy to Netlify (Alternative)

1. Create `netlify/functions/claude.js` with the same logic as `api/claude.js`
2. Set `ANTHROPIC_API_KEY` in Netlify environment variables
3. Update `API_PROXY_URL` in `claudeService.ts` to `/.netlify/functions/claude`
4. Deploy via `netlify deploy --prod`

---

## Run Locally

```bash
npm install

# Set your API key
echo "ANTHROPIC_API_KEY=sk-ant-your-key" > .env.local

# Start both Vite frontend + API proxy
npm run dev
```

This runs:
- **Vite** on `localhost:3000` (frontend)
- **dev-server.js** on `localhost:3001` (API proxy)
- Vite proxies `/api/claude` → `localhost:3001` automatically

---

## Architecture

```
stablemap-intelligence/
├── api/
│   └── claude.js                    # ★ Vercel Edge Function (API proxy)
├── dev-server.js                    # Local dev API proxy
├── vercel.json                      # Vercel deployment config
│
├── App.tsx                          # Main app shell
├── index.tsx                        # React entry point
├── index.html                       # HTML shell + Tailwind CDN
├── types.ts                         # TypeScript interfaces
├── constants.ts                     # Mock data + helpers
├── vite.config.ts                   # Vite build config
│
├── services/
│   ├── claudeService.ts             # ★ Claude AI client (calls /api/claude)
│   ├── firebase.ts                  # Firebase initialization
│   └── db.ts                        # Database (Firestore + localStorage fallback)
├── components/
│   ├── CompanyList.tsx              # Directory grid/list view
│   ├── CompanyDetail.tsx            # Company profile
│   ├── GlobalPartnershipMatrix.tsx  # Fortune 500 tracker
│   ├── GlobalCompanyDetail.tsx      # Fortune 500 detail view
│   ├── PartnershipMatrix.tsx        # USA partnership matrix
│   ├── Intelligence.tsx             # News & events feed
│   ├── JobBoard.tsx                 # Job board
│   ├── JobDetailModal.tsx           # Job detail popup
│   ├── AddNewsModal.tsx             # Manual news entry
│   └── ShareModal.tsx               # Share modal
└── data/
    ├── fortune500Raw.ts             # Fortune 500 USA data
    └── fortuneGlobal500Raw.ts       # Fortune Global 500 data
```

## Security

- **API key is server-side only** — never bundled into the frontend JS
- The Edge Function validates request shape before forwarding to Anthropic
- `max_tokens` is capped at 8192 to prevent abuse
- CORS headers are configurable via `ALLOWED_ORIGIN` env var

## Migration from Gemini

| Component | Before | After |
|---|---|---|
| AI Service | `@google/genai` + OpenRouter + 8-model rotation | Claude Sonnet via `/api/claude` proxy |
| API Key | Baked into frontend bundle | Server-side only (Vercel env var) |
| Database | Firebase Firestore | **Unchanged** |
| Frontend | React 19 + Tailwind | **Unchanged** |
