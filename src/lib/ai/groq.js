// Pipeline stage 3 — Groq / Llama.
// Role: instant, real-time UI suggestions — optimized <title>/meta text and
// concrete alt-tag copy for images missing it. Groq's LPU makes this near-
// instant so it can power live suggestion chips in the UI.

import { chatCompletion, safeJsonParse } from "./openaiCompat";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM = `You are a fast on-page SEO copywriter. Output ONLY a single valid JSON object, no prose or markdown.
You write crisp, human, keyword-aware microcopy. Match this schema exactly:
{
  "titles": [
    { "text": "SEO title option ~50-60 chars, includes the keyword naturally", "chars": 57 }
  ],
  "meta_descriptions": [
    { "text": "compelling meta description ~150-160 chars with a call to action", "chars": 155 }
  ],
  "alt_tags": [
    { "src": "the image src provided", "alt": "descriptive, keyword-aware alt text under 125 chars" }
  ],
  "h1_suggestion": "a strong single H1 for this page targeting the keyword"
}
Provide 3 title options and 2 meta description options. Provide one alt_tag entry for EACH image src provided (max 10).`;

export async function runGroqSuggestions({ apiKey, model, page, keyword }) {
  const missingSrcs = (page.images?.missing_alt_srcs || []).slice(0, 10);
  const user = `PAGE URL: ${page.url}
TARGET KEYWORD: ${keyword}
CURRENT TITLE: ${page.meta?.title || "(none)"}
CURRENT DESCRIPTION: ${page.meta?.description || "(none)"}
PAGE TOPIC (from headings): ${(page.headings?.outline || []).slice(0, 5).map((h) => h.text).join("; ") || "(none)"}
IMAGES MISSING ALT TEXT (src list):
${missingSrcs.length ? missingSrcs.map((s, i) => `${i + 1}. ${s}`).join("\n") : "(none — return an empty alt_tags array)"}

Generate the suggestions JSON now.`;

  const raw = await chatCompletion({
    endpoint: ENDPOINT,
    apiKey,
    model: model || "llama-3.3-70b-versatile",
    system: SYSTEM,
    user,
    temperature: 0.6,
    maxTokens: 1536,
    json: true,
    timeoutMs: 15000,
  });

  const parsed = safeJsonParse(raw);
  if (!parsed) throw new Error("groq_unparseable");
  return parsed;
}
