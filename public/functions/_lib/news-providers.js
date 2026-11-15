// Each provider returns a normalized array:
//   [{ title, description, url, source, image, publishedAt }]
// and THROWS on any failure (quota, bad key, network) so the router can try the next one.
// A provider with no API key is skipped by the router (except the keyless RSS one).

import { fetchWithTimeout, stripHtml } from "./util.js";
import { COUNTRY_NAME } from "./countries.js";

const POLITICS_WORDS = "politics OR government OR election OR parliament OR minister OR president";

function clean(a) {
  return {
    title: stripHtml(a.title),
    description: stripHtml(a.description).replace(/ONLY AVAILABLE IN PAID PLANS/gi, ""),
    url: a.url,
    source: stripHtml(a.source || ""),
    image: a.image || "",
    publishedAt: a.publishedAt || "",
  };
}

async function getJson(url, options) {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* 1. NewsData.io — has a real "politics" category + country filter (free: 200 credits/day) */
export const newsdata = {
  name: "NewsData.io",
  envKey: "NEWSDATA_API_KEY",
  async fetch({ cc, q }, key) {
    const p = new URLSearchParams({ apikey: key, language: "en", category: "politics" });
    if (cc !== "WORLD") p.set("country", cc.toLowerCase());
    if (q) p.set("q", q);
    const data = await getJson(`https://newsdata.io/api/1/latest?${p}`);
    if (data.status && data.status !== "success") throw new Error(data.results?.message || "error");
    return (data.results || []).map((r) =>
      clean({
        title: r.title,
        description: r.description,
        url: r.link,
        source: r.source_name || r.source_id,
        image: r.image_url,
        publishedAt: r.pubDate ? r.pubDate.replace(" ", "T") + "Z" : "",
      })
    );
  },
};

/* 2. GNews — "nation" category = national politics (free: 100 requests/day) */
export const gnews = {
  name: "GNews",
  envKey: "GNEWS_API_KEY",
  async fetch({ cc, q }, key) {
    const p = new URLSearchParams({ apikey: key, lang: "en", max: "20" });
    let endpoint = "top-headlines";
    if (q) {
      endpoint = "search";
      p.set("q", q);
    } else {
      p.set("category", cc === "WORLD" ? "world" : "nation");
    }
    if (cc !== "WORLD") p.set("country", cc.toLowerCase());
    const data = await getJson(`https://gnews.io/api/v4/${endpoint}?${p}`);
    return (data.articles || []).map((r) =>
      clean({
        title: r.title,
        description: r.description,
        url: r.url,
        source: r.source?.name,
        image: r.image,
        publishedAt: r.publishedAt,
      })
    );
  },
};

/* 3. NewsAPI.org — no politics category, so we search politics words + country name */
export const newsapi = {
  name: "NewsAPI.org",
  envKey: "NEWSAPI_API_KEY",
  async fetch({ cc, q }, key) {
    const country = COUNTRY_NAME[cc];
    const topic = q || POLITICS_WORDS;
    const query = cc === "WORLD" ? `(${topic})` : `"${country}" AND (${topic})`;
    const p = new URLSearchParams({ q: query, language: "en", sortBy: "publishedAt", pageSize: "20" });
    const data = await getJson(`https://newsapi.org/v2/everything?${p}`, {
      headers: { "X-Api-Key": key },
    });
    if (data.status !== "ok") throw new Error(data.message || "error");
    return (data.articles || [])
      .filter((r) => r.title && r.title !== "[Removed]")
      .map((r) =>
        clean({
          title: r.title,
          description: r.description,
          url: r.url,
          source: r.source?.name,
          image: r.urlToImage,
          publishedAt: r.publishedAt,
        })
      );
  },
};

/* 4. Currents API — v2 category "politics_government", Bearer auth */
export const currents = {
  name: "Currents API",
  envKey: "CURRENTS_API_KEY",
  async fetch({ cc, q }, key) {
    const p = new URLSearchParams({ language: "en" });
    let endpoint = "latest-news";
    if (q) {
      endpoint = "search";
      p.set("keywords", q);
    }
    p.set("category", "politics_government");
    if (cc !== "WORLD") p.set("country", cc);
    const data = await getJson(`https://api.currentsapi.services/v2/${endpoint}?${p}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (data.status && data.status !== "ok") throw new Error(data.msg || "error");
    return (data.news || []).map((r) =>
      clean({
        title: r.title,
        description: r.description,
        url: r.url,
        source: r.author,
        image: r.image && r.image !== "None" ? r.image : "",
        publishedAt: r.published ? r.published.replace(" +0000", "Z").replace(" ", "T") : "",
      })
    );
  },
};

/* 5. Google News RSS — NO key, never runs out. Last-resort fallback. */
export function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  const tag = (block, name) => {
    const r = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`));
    if (!r) return "";
    return r[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  };
  while ((m = re.exec(xml))) {
    const b = m[1];
    let title = stripHtml(tag(b, "title"));
    let source = stripHtml(tag(b, "source"));
    // Google News titles look like "Headline - Source Name"
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    let description = stripHtml(tag(b, "description"));
    if (!description || description.startsWith(title.slice(0, 30))) description = "";
    const pub = tag(b, "pubDate");
    items.push({
      title,
      description,
      url: stripHtml(tag(b, "link")),
      source,
      image: "",
      publishedAt: pub ? new Date(pub).toISOString() : "",
    });
  }
  return items;
}

export const googleRss = {
  name: "Google News RSS (no key)",
  envKey: null,
  async fetch({ cc, q }) {
    const country = COUNTRY_NAME[cc];
    const topic = q || "politics";
    const query = cc === "WORLD" ? `${topic} when:2d` : `${topic} ${country} when:3d`;
    const tryEdition = async (gl) => {
      const url =
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
        `&hl=en-${gl}&gl=${gl}&ceid=${gl}:en`;
      const res = await fetchWithTimeout(url, { headers: { "user-agent": "Mozilla/5.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseRss(await res.text());
    };
    let items = [];
    if (cc !== "WORLD") {
      try {
        items = await tryEdition(cc);
      } catch {
        items = [];
      }
    }
    if (!items.length) items = await tryEdition("US");
    return items.slice(0, 25).map(clean);
  },
};

// Order = priority. The router walks down this list until one returns articles.
export const NEWS_PROVIDERS = [newsdata, gnews, newsapi, currents, googleRss];
