// Every provider has the same shape: run(messages, env) -> string (the AI's text).
// It THROWS on failure (rate limit, bad key...) so the router moves to the next one.
// Providers without a key are skipped. Workers AI needs no key (just the AI binding).

import { fetchWithTimeout } from "./util.js";

async function openAiStyle(url, key, model, messages, extraHeaders = {}, extraBody = {}) {
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}`, ...extraHeaders },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 1800, ...extraBody }),
    },
    25000
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty response");
  return text;
}

/* 1. Groq — very fast, generous free tier */
const groq = {
  name: "Groq",
  envKey: "GROQ_API_KEY",
  run: (messages, env) =>
    openAiStyle(
      "https://api.groq.com/openai/v1/chat/completions",
      env.GROQ_API_KEY,
      env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages
    ),
};

/* 2. Google Gemini — free tier via AI Studio key */
const gemini = {
  name: "Google Gemini",
  envKey: "GEMINI_API_KEY",
  async run(messages, env) {
    const model = env.GEMINI_MODEL || "gemini-2.5-flash";
    const system = messages.find((m) => m.role === "system")?.content || "";
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 1800 },
        }),
      },
      25000
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("");
    if (!text) throw new Error("empty response");
    return text;
  },
};

/* 3. OpenRouter — "openrouter/free" automatically picks an available free model */
const openrouter = {
  name: "OpenRouter",
  envKey: "OPENROUTER_API_KEY",
  run: (messages, env) =>
    openAiStyle(
      "https://openrouter.ai/api/v1/chat/completions",
      env.OPENROUTER_API_KEY,
      env.OPENROUTER_MODEL || "openrouter/free",
      messages,
      { "X-Title": "Politics in Simple English" }
    ),
};

/* 4. Cloudflare Workers AI — NO key. Uses the "AI" binding you add in the dashboard. */
const workersAi = {
  name: "Cloudflare Workers AI",
  envKey: null,
  async run(messages, env) {
    if (!env.AI) throw new Error('AI binding not set (add binding named "AI")');
    const model = env.WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";
    const out = await env.AI.run(model, { messages, max_tokens: 1800, temperature: 0.3 });
    const text = out?.response;
    if (!text) throw new Error("empty response");
    return text;
  },
};

export const AI_PROVIDERS = [groq, gemini, openrouter, workersAi];

// Walks the list until one works. `validate` can reject a bad answer (e.g. broken JSON),
// which counts as a failure and moves on to the next provider.
export async function askAI(messages, env, validate = (t) => t) {
  const tried = [];
  for (const p of AI_PROVIDERS) {
    if (p.envKey && !env[p.envKey]) {
      tried.push({ provider: p.name, status: "skipped (no key set)" });
      continue;
    }
    try {
      const raw = await p.run(messages, env);
      const result = validate(raw);
      tried.push({ provider: p.name, status: "ok" });
      return { provider: p.name, result, tried };
    } catch (err) {
      tried.push({ provider: p.name, status: `failed: ${err.message}` });
    }
  }
  const e = new Error("All AI providers failed");
  e.tried = tried;
  throw e;
}
