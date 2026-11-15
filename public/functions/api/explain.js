// POST /api/explain
//   { mode: "simplify", title, text }          -> simple-English version + hard terms with definitions
//   { mode: "term", term, context }            -> explanation of one word/phrase the reader clicked
// Uses the AI router: Groq -> Gemini -> OpenRouter -> Workers AI.

import { json, cacheGet, cachePut, parseJsonLoose } from "../_lib/util.js";
import { askAI } from "../_lib/ai-providers.js";

const SIMPLIFY_SYSTEM = `You help people understand political news. Rewrite the article in SIMPLE English
(short sentences, everyday words, about a 12-year-old reading level). Keep every important fact. Do not add
opinions or facts that are not in the text. If the text is only a headline or a short snippet, say only what
it says and do not invent details.

Then list the hard political words/phrases that a beginner may not know (e.g. "coalition", "veto", "no-confidence
vote", "sanctions"). Give each a one-sentence plain-English definition.

Reply with ONLY valid JSON, no markdown, in exactly this shape:
{
  "summary": "2-3 sentence summary in simple English",
  "paragraphs": ["simple English paragraph 1", "paragraph 2"],
  "terms": [{"term": "coalition", "meaning": "a group of parties that work together to run the government"}]
}
Rules: each "term" MUST appear exactly as written inside "summary" or "paragraphs" (same spelling), so it can be
highlighted. Give 3 to 10 terms. Maximum 5 paragraphs.`;

const TERM_SYSTEM = `You explain political words to beginners in SIMPLE English (12-year-old level).
Reply with ONLY valid JSON, no markdown:
{"term": "...", "meaning": "one sentence definition", "example": "one short real-life example", "why_it_matters": "one sentence"}
Be neutral and factual. No opinions.`;

function validateSimplify(raw) {
  const o = parseJsonLoose(raw);
  if (!o || typeof o.summary !== "string" || !Array.isArray(o.paragraphs)) throw new Error("bad JSON shape");
  o.terms = Array.isArray(o.terms) ? o.terms.filter((t) => t && t.term && t.meaning) : [];
  o.paragraphs = o.paragraphs.filter((p) => typeof p === "string" && p.trim());
  return o;
}

function validateTerm(raw) {
  const o = parseJsonLoose(raw);
  if (!o || typeof o.meaning !== "string") throw new Error("bad JSON shape");
  return o;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const mode = body.mode;
  try {
    if (mode === "simplify") {
      const title = String(body.title || "").slice(0, 300);
      const text = String(body.text || "").slice(0, 9000);
      if (text.length < 20 && title.length < 10) return json({ error: "Not enough text" }, 400);

      const key = `https://cache.local/simplify/${await sha(title + "|" + text)}`;
      const hit = await cacheGet(key);
      if (hit) return json({ ...hit, cached: true });

      const { provider, result, tried } = await askAI(
        [
          { role: "system", content: SIMPLIFY_SYSTEM },
          { role: "user", content: `TITLE: ${title}\n\nTEXT:\n${text || "(no body text, headline only)"}` },
        ],
        env,
        validateSimplify
      );
      const payload = { provider, tried, ...result };
      await cachePut(key, payload, 7 * 24 * 3600);
      return json(payload);
    }

    if (mode === "term") {
      const term = String(body.term || "").trim().slice(0, 80);
      const context = String(body.context || "").slice(0, 500);
      if (!term) return json({ error: "No term" }, 400);

      const key = `https://cache.local/term/${await sha(term.toLowerCase())}`;
      const hit = await cacheGet(key);
      if (hit) return json({ ...hit, cached: true });

      const { provider, result, tried } = await askAI(
        [
          { role: "system", content: TERM_SYSTEM },
          { role: "user", content: `Explain: "${term}"${context ? `\nIt appeared in this sentence: ${context}` : ""}` },
        ],
        env,
        validateTerm
      );
      const payload = { provider, tried, ...result, term };
      await cachePut(key, payload, 30 * 24 * 3600);
      return json(payload);
    }

    return json({ error: 'mode must be "simplify" or "term"' }, 400);
  } catch (err) {
    return json({ error: err.message, tried: err.tried || [] }, 502);
  }
}

async function sha(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
