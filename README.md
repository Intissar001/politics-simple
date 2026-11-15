# Politics, Simply

Read political news from any country in simple English. Tap any hard word to get an easy explanation.

```
public/        the website (index.html, style.css, app.js)
functions/     the backend that runs on Cloudflare (hides your API keys)
  api/news.js      news router:  NewsData -> GNews -> NewsAPI.org -> Currents -> Google News RSS (no key)
  api/explain.js   AI router:    Groq -> Gemini -> OpenRouter -> Cloudflare Workers AI (no key)
  api/article.js   tries to read the full article text
wrangler.toml  Cloudflare settings (adds the free Workers AI binding)
```

## How the fallback works

* Each API is tried in order. If it has **no key**, is **out of quota**, or **errors**, the next one is used.
* News and explanations are **cached** (news 15 min, explanations days), so your free quotas last much longer.
* The last news source (Google News RSS) and the last AI (Cloudflare Workers AI) need **no key**, so the site keeps working even with zero keys.
* You do **not** need all keys. Add what you can get; missing keys are skipped.

## 1. Get free keys (all optional)

| Name in Cloudflare | Where to get it | Used for |
|---|---|---|
| `NEWSDATA_API_KEY` | newsdata.io | news (has a real "politics" category) |
| `GNEWS_API_KEY` | gnews.io | news |
| `NEWSAPI_API_KEY` | newsapi.org | news (free plan is for development only, with a delay) |
| `CURRENTS_API_KEY` | currentsapi.services | news |
| `GROQ_API_KEY` | console.groq.com | AI (fast) |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | AI |
| `OPENROUTER_API_KEY` | openrouter.ai/keys | AI (default model `openrouter/free` picks an available free model) |

Free plans change often. Check each site's current limits.

## 2. Put it on Cloudflare (free)

You need a free Cloudflare account and Node.js installed.

```bash
cd politics-simple
npm install
npx wrangler login
npx wrangler pages project create politics-simple --production-branch main
npm run deploy
```

Cloudflare prints your site address, like `https://politics-simple.pages.dev`.

(Another way: put this folder on GitHub, then in Cloudflare go to **Workers & Pages → Create → Pages → Connect to Git**. Build command: empty. Output directory: `public`.)

## 3. Where to put the API keys

**Never put keys in the code or in `public/`.** Put them in Cloudflare as secrets:

*Dashboard:* Workers & Pages → your project → **Settings → Variables and Secrets → Add** → choose type **Secret** → use the exact names from the table above → redeploy.

*Or terminal:* `npx wrangler pages secret put GROQ_API_KEY --project-name politics-simple` (it asks you to paste the key). Repeat for each key.

Cloudflare Workers AI works without a key because of the `[ai]` binding in `wrangler.toml`. If you use the Git method and the binding is missing, add it in Settings → Bindings → Workers AI → variable name `AI`.

## 4. Test it on your computer first

```bash
cp .dev.vars.example .dev.vars    # put your keys in .dev.vars
npm install
npm run dev                       # opens http://localhost:8788
```

## Check which API answered

Open `/api/news?country=MA` in your browser. The `tried` list shows each provider and whether it worked, was skipped, or failed. The site also shows the provider name under the title.

## Protect your free quotas

Anyone with your link can use your AI. In Cloudflare: **Security → WAF → Rate limiting rules**, and limit `/api/explain` to something like 20 requests per minute per IP.

## Change models later

Set these optional variables in Cloudflare: `GROQ_MODEL`, `GEMINI_MODEL`, `OPENROUTER_MODEL`, `WORKERS_AI_MODEL`. Free model names change, so if one stops working, check the provider's model list.
