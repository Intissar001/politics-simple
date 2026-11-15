// GET /api/news?country=MA&q=optional
// Tries each news API in order. If one has no key, is out of quota, or fails,
// the next one is used. The keyless Google News RSS is the final safety net.

import { json, cacheGet, cachePut } from "../_lib/util.js";
import { NEWS_PROVIDERS } from "../_lib/news-providers.js";
import { COUNTRY_NAME } from "../_lib/countries.js";

const TTL = 15 * 60; // cache 15 minutes so free quotas last

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const cc = (url.searchParams.get("country") || "WORLD").toUpperCase();
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  if (!COUNTRY_NAME[cc]) return json({ error: "Unknown country code" }, 400);

  const cacheKey = `https://cache.local/news/${cc}/${encodeURIComponent(q.toLowerCase())}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return json({ ...cached, cached: true });

  const tried = [];
  for (const p of NEWS_PROVIDERS) {
    const key = p.envKey ? env[p.envKey] : "none";
    if (!key) {
      tried.push({ provider: p.name, status: "skipped (no key set)" });
      continue;
    }
    try {
      const articles = (await p.fetch({ cc, q }, key)).filter((a) => a.title && a.url);
      if (!articles.length) {
        tried.push({ provider: p.name, status: "no results" });
        continue;
      }
      tried.push({ provider: p.name, status: "ok" });
      const payload = { provider: p.name, country: cc, tried, articles };
      await cachePut(cacheKey, payload, TTL);
      return json(payload);
    } catch (err) {
      tried.push({ provider: p.name, status: `failed: ${err.message}` });
    }
  }
  return json({ error: "All news providers failed", tried, articles: [] }, 502);
}
