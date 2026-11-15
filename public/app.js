"use strict";

/* ---------- tiny helpers ---------- */
const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
function timeAgo(iso) {
  const t = Date.parse(iso);
  if (!t) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  return `${Math.round(hr / 24)} d ago`;
}
async function api(path, options) {
  const res = await fetch(path, options);
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.tried = data && data.tried;
    throw err;
  }
  return data;
}

/* ---------- state ---------- */
const state = { articles: [], readerToken: 0 };

/* ---------- countries + news list ---------- */
async function loadCountries() {
  let list;
  try { list = await api("/api/countries"); }
  catch { list = [{ code: "WORLD", name: "World (all countries)" }, { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" }, { code: "MA", name: "Morocco" }]; }
  const sel = $("country");
  sel.replaceChildren(...list.map((c) => h("option", { value: c.code }, c.name)));
  sel.value = store.get("country") || "WORLD";
  if (!sel.value) sel.value = "WORLD";
}

async function loadNews() {
  const cc = $("country").value;
  const q = $("q").value.trim();
  store.set("country", cc);
  const grid = $("grid");
  $("status").textContent = "Loading stories…";
  grid.replaceChildren(...Array.from({ length: 6 }, () => h("div", { class: "skel" })));
  try {
    const data = await api(`/api/news?country=${encodeURIComponent(cc)}&q=${encodeURIComponent(q)}`);
    state.articles = data.articles;
    const name = $("country").selectedOptions[0].textContent;
    $("status").textContent = `${data.articles.length} stories · ${name} · source: ${data.provider}${data.cached ? " (saved copy, refreshes every 15 min)" : ""}`;
    renderCards();
  } catch (err) {
    $("status").textContent = "";
    grid.replaceChildren(h("div", { class: "empty" },
      h("strong", {}, "Could not load news. "), err.message,
      err.tried ? h("div", {}, h("small", {}, err.tried.map((t) => `${t.provider}: ${t.status}`).join(" · "))) : null));
  }
}

function renderCards() {
  const grid = $("grid");
  if (!state.articles.length) {
    grid.replaceChildren(h("div", { class: "empty" }, "No stories found. Try another country or a different topic."));
    return;
  }
  grid.replaceChildren(...state.articles.map((a, i) =>
    h("article", { class: "card" },
      a.image ? h("img", { src: a.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer", onerror: (e) => e.target.remove() }) : null,
      h("div", { class: "in" },
        h("div", { class: "meta" }, a.source ? h("b", {}, a.source) : null, timeAgo(a.publishedAt)),
        h("h2", {}, a.title),
        a.description ? h("p", {}, a.description) : null,
        h("button", { class: "btn primary small", onclick: () => openReader(state.articles[i]) }, "Read in simple English")))));
}

/* ---------- reader ---------- */
function showReader(show) {
  $("reader").hidden = !show;
  $("overlay").hidden = !show;
  document.body.style.overflow = show ? "hidden" : "";
  if (!show) { hidePop(); hideSel(); state.readerToken++; }
}

function setOriginal(url) {
  const a = $("origLink");
  if (url) { a.href = url; a.hidden = false; } else a.hidden = true;
}

async function openReader(article) {
  const token = ++state.readerToken;
  showReader(true);
  setOriginal(article.url);
  const body = $("readerBody");
  body.scrollTop = 0;
  const head = [
    h("h2", {}, article.title),
    h("div", { class: "meta" }, article.source ? h("b", {}, article.source) : null, timeAgo(article.publishedAt)),
  ];
  body.replaceChildren(...head, h("p", { class: "note" }, "Reading the article…"));

  // 1) try to get the full text; 2) fall back to the snippet
  let text = article.description || "";
  let full = false;
  try {
    const r = await api(`/api/article?url=${encodeURIComponent(article.url)}`);
    if (r.text && r.text.length > Math.max(300, text.length)) { text = r.text; full = true; }
  } catch { /* use snippet */ }
  if (token !== state.readerToken) return;

  body.replaceChildren(...head, h("p", { class: "note" }, "Making it simple…"));
  const note = full ? null : "This simple version is based on the headline and short summary only, because the full article could not be read automatically. Use “Open original” for the full story, or copy the article and use “Paste my own text”.";
  await runSimplify(article.title, text, head, note, token);
}

async function runSimplify(title, text, head, note, token) {
  const body = $("readerBody");
  try {
    const data = await api("/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "simplify", title, text }),
    });
    if (token !== state.readerToken) return;
    body.replaceChildren(...head, ...renderSimple(data, note));
  } catch (err) {
    if (token !== state.readerToken) return;
    body.replaceChildren(...head,
      h("p", { class: "err" }, "Could not simplify this story right now: " + err.message,
        err.tried ? h("br") : null,
        err.tried ? h("small", {}, err.tried.map((t) => `${t.provider}: ${t.status}`).join(" · ")) : null),
      h("button", { class: "btn", onclick: () => runSimplify(title, text, head, note, token) }, "Try again"));
  }
}

function renderSimple(data, note) {
  const terms = data.terms || [];
  const meaning = new Map(terms.map((t) => [t.term.toLowerCase(), t.meaning]));
  const nodes = [];
  if (note) nodes.push(h("p", { class: "note" }, note));
  nodes.push(h("p", { class: "label" }, "In short"));
  nodes.push(h("div", { class: "summary" }, highlight(data.summary, terms)));
  nodes.push(h("p", { class: "label" }, "The story"));
  nodes.push(h("div", { class: "story" }, data.paragraphs.map((p) => h("p", {}, highlight(p, terms)))));
  if (terms.length) {
    nodes.push(h("div", { class: "glossary" },
      h("p", { class: "label" }, "Hard words in this story"),
      h("dl", {}, terms.flatMap((t) => [h("dt", {}, t.term), h("dd", {}, t.meaning)]))));
  }
  nodes.push(h("p", { class: "note" }, `Simplified by AI (${data.provider}). Tap a highlighted word, or select any text, to get an explanation.`));
  renderSimple.meaning = meaning;
  return nodes;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function highlight(text, terms) {
  const frag = document.createDocumentFragment();
  const list = [...new Set(terms.map((t) => t.term))].sort((a, b) => b.length - a.length);
  if (!list.length) { frag.append(text); return frag; }
  const re = new RegExp(`(${list.map(escapeRe).join("|")})`, "gi");
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const word = m[0];
    const def = terms.find((t) => t.term.toLowerCase() === word.toLowerCase());
    frag.append(h("button", { class: "term", type: "button", onclick: (e) => showTermPop(e.currentTarget, word, def && def.meaning, text) }, word));
    last = m.index + word.length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

/* ---------- popover: explain a word ---------- */
function placePop(rect) {
  const pop = $("pop");
  pop.hidden = false;
  const w = pop.offsetWidth, ph = pop.offsetHeight;
  let left = Math.min(Math.max(12, rect.left), window.innerWidth - w - 12);
  let top = rect.bottom + 8;
  if (top + ph > window.innerHeight - 12) top = Math.max(12, rect.top - ph - 8);
  pop.style.left = left + "px";
  pop.style.top = top + "px";
}
function hidePop() { $("pop").hidden = true; }

function popContent(title, ...rest) {
  const pop = $("pop");
  pop.replaceChildren(h("h3", {}, title), ...rest);
}

function showTermPop(anchor, term, meaning, context) {
  const rect = anchor.getBoundingClientRect();
  popContent(term,
    h("p", {}, meaning || "No short definition yet."),
    h("div", { class: "row" }, h("button", { class: "btn small", onclick: () => explainMore(rect, term, context) }, "Tell me more")));
  placePop(rect);
}

async function explainMore(rect, term, context) {
  popContent(term, h("p", {}, h("small", {}, "Thinking…")));
  placePop(rect);
  try {
    const d = await api("/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "term", term, context: (context || "").slice(0, 400) }),
    });
    popContent(d.term || term,
      h("p", {}, d.meaning),
      d.example ? h("p", {}, h("b", {}, "Example: "), d.example) : null,
      d.why_it_matters ? h("p", {}, h("b", {}, "Why it matters: "), d.why_it_matters) : null,
      h("small", {}, `AI: ${d.provider}`));
  } catch (err) {
    popContent(term, h("p", { class: "err" }, "Could not explain right now: " + err.message));
  }
  placePop(rect);
}

/* ---------- select any text -> "Explain this" ---------- */
let selText = "", selRect = null, selContext = "";
function hideSel() { $("selBtn").hidden = true; }

function checkSelection() {
  const sel = window.getSelection();
  const body = $("readerBody");
  if (!sel || sel.isCollapsed || !sel.rangeCount || $("reader").hidden) return hideSel();
  const range = sel.getRangeAt(0);
  if (!body.contains(range.commonAncestorContainer)) return hideSel();
  const text = sel.toString().trim();
  if (text.length < 2 || text.length > 80) return hideSel();
  selText = text;
  selRect = range.getBoundingClientRect();
  const node = range.commonAncestorContainer;
  selContext = (node.nodeType === 3 ? node.parentElement : node).textContent.slice(0, 400);
  const btn = $("selBtn");
  btn.hidden = false;
  btn.style.left = Math.min(Math.max(12, selRect.left), window.innerWidth - btn.offsetWidth - 12) + "px";
  btn.style.top = Math.max(12, selRect.top - btn.offsetHeight - 8) + "px";
}

/* ---------- paste your own text ---------- */
function openPaste() {
  const token = ++state.readerToken;
  showReader(true);
  setOriginal(null);
  const ta = h("textarea", { placeholder: "Paste a political article or paragraph here…", maxlength: "9000" });
  const go = h("button", { class: "btn primary", type: "button", onclick: async () => {
    const text = ta.value.trim();
    if (text.length < 40) { ta.focus(); return; }
    const t2 = ++state.readerToken;
    const head = [h("h2", {}, "Your text, in simple English")];
    $("readerBody").replaceChildren(...head, h("p", { class: "note" }, "Making it simple…"));
    await runSimplify("", text, head, null, t2);
  } }, "Make it simple");
  $("readerBody").replaceChildren(
    h("h2", {}, "Paste your own text"),
    h("div", { class: "paste" }, h("p", { class: "note" }, "Paste any article or paragraph (up to about 9,000 characters). The AI will rewrite it in simple English and explain the hard words."), ta, go));
  void token;
  ta.focus();
}

/* ---------- wire up ---------- */
$("controls").addEventListener("submit", (e) => { e.preventDefault(); loadNews(); });
$("country").addEventListener("change", loadNews);
$("pasteBtn").addEventListener("click", openPaste);
$("closeReader").addEventListener("click", () => showReader(false));
$("overlay").addEventListener("click", () => showReader(false));
$("selBtn").addEventListener("click", () => {
  const rect = selRect;
  hideSel();
  explainMore(rect, selText, selContext);
});
$("askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const term = $("askInput").value.trim();
  if (!term) return;
  const r = $("askInput").getBoundingClientRect();
  explainMore({ left: r.left, top: r.top, bottom: r.top - 4 }, term, "");
  $("askInput").value = "";
});
document.addEventListener("mouseup", () => setTimeout(checkSelection, 10));
document.addEventListener("touchend", () => setTimeout(checkSelection, 300));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("pop").hidden) hidePop(); else if (!$("reader").hidden) showReader(false);
});
document.addEventListener("click", (e) => {
  if (!$("pop").hidden && !e.target.closest("#pop") && !e.target.closest(".term") && !e.target.closest("#selBtn") && !e.target.closest("#askForm")) hidePop();
});

(async function init() {
  await loadCountries();
  loadNews();
})();
