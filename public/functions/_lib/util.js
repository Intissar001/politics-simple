// Small helpers shared by all API routes.

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      ...extraHeaders,
    },
  });
}

export async function fetchWithTimeout(url, options = {}, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Reads a Cache API entry (works on Cloudflare Pages Functions).
export async function cacheGet(key) {
  try {
    const res = await caches.default.match(new Request(key));
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function cachePut(key, data, ttlSeconds) {
  try {
    const res = new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${ttlSeconds}`,
      },
    });
    await caches.default.put(new Request(key), res);
  } catch {
    /* cache is best-effort */
  }
}

// LLMs sometimes wrap JSON in ```json fences or add a sentence before it.
export function parseJsonLoose(text) {
  if (!text) throw new Error("empty AI response");
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object in AI response");
    return JSON.parse(t.slice(start, end + 1));
  }
}

// Feeds (e.g. Google News RSS) often ship HTML *escaped* (&lt;a href=...&gt;), so decode the
// entities first, then remove the tags, then clean up spaces.
export function stripHtml(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
