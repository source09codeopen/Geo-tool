// Pipeline stage 2 — Qwen 3 (via OpenRouter).
// Role: generate clean, valid JSON-LD structured data and localized schema
// grounded in the deterministic on-page audit + scraped content.

import { chatCompletion, safeJsonParse } from "./openaiCompat";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM = `You are a structured-data engineer specializing in Schema.org JSON-LD for SEO and AI-search citation.
You output ONLY a single valid JSON object — no prose, no markdown fences.

Given a page's URL, target keyword, extracted title/description/headings and detected content type, produce this exact schema:
{
  "primary_type": "The most fitting Schema.org @type for this page (e.g. Organization, WebSite, Product, Article, LocalBusiness, FAQPage)",
  "jsonld": "A COMPLETE, ready-to-paste <script type=\\"application/ld+json\\">...</script> block. Populate every field with REAL values inferred from the page data provided — never placeholders like 'Your Company'. Use the real URL, real title, real description.",
  "localized_schema": "A SECOND <script type=\\"application/ld+json\\"> block adding localization: inLanguage set from the page's lang, and if a physical business is implied, a LocalBusiness/PostalAddress skeleton with @language annotations. If no localization applies, return a BreadcrumbList for the page instead.",
  "meta_fixes": [
    { "field": "title", "current": "the current title", "suggested": "improved <title> text ~50-60 chars targeting the keyword", "reason": "one sentence" },
    { "field": "description", "current": "the current description", "suggested": "improved meta description ~150-160 chars", "reason": "one sentence" }
  ],
  "notes": "One sentence on why this structured-data choice maximizes AI-search citation for this page."
}`;

export async function runQwenSchema({ apiKey, model, page, keyword }) {
  const user = `PAGE URL: ${page.url}
TARGET KEYWORD: ${keyword}
LANG: ${page.meta?.lang || "en"}
CURRENT TITLE: ${page.meta?.title || "(none)"}
CURRENT META DESCRIPTION: ${page.meta?.description || "(none)"}
H1/H2 OUTLINE: ${(page.headings?.outline || []).slice(0, 8).map((h) => `H${h.level}: ${h.text}`).join(" | ") || "(none)"}
DETECTED JSON-LD ALREADY PRESENT: ${page.technical?.has_json_ld ? `yes (${page.technical.json_ld_blocks} block(s))` : "no"}
CONTENT SAMPLE: ${(page.content?.text_sample || "").slice(0, 400)}

Generate the structured-data JSON now.`;

  const raw = await chatCompletion({
    endpoint: ENDPOINT,
    apiKey,
    model: model || "qwen/qwen3-32b",
    system: SYSTEM,
    user,
    temperature: 0.3,
    maxTokens: 2048,
    json: true,
    timeoutMs: 22000,
    // OpenRouter appreciates attribution headers (optional but recommended).
    extraHeaders: {
      "HTTP-Referer": "https://github.com/source09codeopen/Geo-tool",
      "X-Title": "Synapcite GEO Optimizer",
    },
  });

  const parsed = safeJsonParse(raw);
  if (!parsed) throw new Error("qwen_unparseable");
  return parsed;
}
