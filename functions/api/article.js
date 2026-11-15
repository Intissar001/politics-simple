// GET /api/article?url=https://...
// Best-effort: downloads the article page and pulls out the paragraph text so the AI can simplify
// the full story (APIs usually only give a short snippet). Many sites block this or hide text behind
// paywalls; in that case the site falls back to the snippet or lets the reader paste the text.

import { json, fetchWithTimeout, stripHtml } from "../_lib/util.js";

function isSafeUrl(u) {
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return false; // raw IPs
  return true;
}

export async function onRequestGet({ request }) {
  const target = new URL(request.url).searchParams.get("url") || "";
  let u;
  try {
    u = new URL(target);
  } catch {
    return json({ error: "Bad URL" }, 400);
  }
  if (!isSafeUrl(u)) return json({ error: "URL not allowed" }, 400);

  // Google News links are JavaScript redirects, so the real page can't be fetched from here.
  if (u.hostname.endsWith("news.google.com")) {
    return json({ text: "", reason: "google-news-link" });
  }

  try {
    const res = await fetchWithTimeout(
      u.toString(),
      { headers: { "user-agent": "Mozilla/5.0 (compatible; SimplePoliticsReader/1.0)", accept: "text/html" }, redirect: "follow" },
      9000
    );
    if (!res.ok) return json({ text: "", reason: `HTTP ${res.status}` });
    const type = res.headers.get("content-type") || "";
    if (!type.includes("html")) return json({ text: "", reason: "not-html" });

    const paras = [];
    let buf = "";
    const rewriter = new HTMLRewriter()
      .on("script, style, nav, footer, aside, form", {
        element(el) {
          el.remove();
        },
      })
      .on("p", {
        element(el) {
          buf = "";
          el.onEndTag(() => {
            const s = stripHtml(buf);
            if (s.length > 60) paras.push(s);
            buf = "";
          });
        },
        text(t) {
          buf += t.text;
        },
      });
    await rewriter.transform(res).arrayBuffer();

    let text = paras.join("\n\n").slice(0, 8000);
    return json({ text, reason: text ? "ok" : "no-text-found" }, 200, {
      "cache-control": "public, max-age=3600",
    });
  } catch (err) {
    return json({ text: "", reason: err.message });
  }
}
