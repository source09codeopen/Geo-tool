// GEO optimization pipeline — orchestrates the three-model chain:
//
//   [ Raw HTML / Full Page Crawl ] ─► Gemini Flash  (heavy DOM parse + llms.txt + core audit)
//   [ Structured Data & Meta Fixes ] ─► Qwen 3       (clean JSON-LD & localized schema)
//   [ Real-Time UI Suggestions ]     ─► Groq / Llama (instant titles & alt tags)
//
// Each stage is independently fault-tolerant: if a provider key is missing or a
// call fails, that stage is marked "skipped"/"failed" and the rest of the report
// is still produced. Gemini is the backbone; Qwen and Groq run in parallel and
// enrich the report.

import { analyzeOnPageSeo } from "../seo/onpage";
import { runGeminiAudit } from "./gemini";
import { runQwenSchema } from "./qwen";
import { runGroqSuggestions } from "./groq";
import { safeJsonParse } from "./openaiCompat";

const GEMINI_SYSTEM_PROMPT = `You are an expert Generative Engine Optimization (GEO) auditor and AI Search Visibility specialist.
Your task is to analyze the scraped website text and evaluate how well it is optimized to be cited, referenced, and surfaced in AI-driven search answers (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini) for the user's target search query.

You MUST respond with a single, valid JSON object matching this schema exactly:
{
  "visibility_score": 85,
  "eeat_score": 75,
  "citation_likelihood": 65,
  "readability_score": 90,
  "summary": "Short overview summarizing the website's AI search readiness...",
  "strengths": ["Strength item 1", "Strength item 2"],
  "weaknesses": ["Weakness item 1", "Weakness item 2"],
  "technical_audit": {
    "robots_txt": "Status profile here",
    "schema_markup": "Status profile here",
    "sitemap": "Status profile here"
  },
  "engine_breakdown": [
    { "engine": "ChatGPT Search", "score": 60, "note": "One sentence on this page's odds via OAI-SearchBot crawling and Bing real-time indexation." },
    { "engine": "Perplexity AI", "score": 55, "note": "One sentence on citation odds given Perplexity's preference for academic, structured, high-authority sources." },
    { "engine": "Google Gemini / AI Overviews", "score": 70, "note": "One sentence based on Knowledge Graph entities, Schema markup, and organic Google SERP ranking signals." },
    { "engine": "Claude", "score": 40, "note": "One sentence on markdown cleanliness, concise formatting, and llms.txt presence." }
  ],
  "impact_effort_matrix": {
    "quick_wins": ["High-impact, low-effort fix, e.g. deploying llms.txt or unblocking an AI crawler in robots.txt"],
    "strategic_growth": ["High-impact, high-effort fix, e.g. building a JSON-LD entity graph or publishing original research"],
    "low_priority": ["Low-impact, low-effort fix, e.g. a minor syntax tweak on a low-traffic page"]
  },
  "code_fixes": [
    { "title": "Short title", "type": "json-ld", "description": "One sentence on why this helps.", "code": "Complete, ready-to-paste code with real inferred values — never placeholders." }
  ],
  "page_reports": [
    { "url": "Exact URL", "title": "actual <title> text", "visibility_score": 70, "summary": "One sentence on this page's AI visibility.", "fixes": ["Specific fix 1", "Specific fix 2", "Specific fix 3"], "meta_fix": { "title": "~50-60 char title", "description": "~150-160 char description" } }
  ]
}

Populate "code_fixes" with exactly these 4 entries, tailored to the actual scraped content, keyword and URL (never placeholders):
1. type "json-ld": A complete Organization or WebPage JSON-LD block (full <script> tag) reflecting the real page content.
2. type "robots-txt": Concrete robots.txt lines explicitly allowing GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Amazonbot.
3. type "llms-txt": A draft /llms.txt file (the emerging llms.txt standard) summarizing the site's purpose, key pages, and the keyword topic for LLM consumption.
4. type "meta-tags": Improved <title> and <meta name="description"> tags (title ~50-60 chars, description ~150-160 chars).

Populate "page_reports" with ONE entry for EVERY page under "SITE PAGES" (including homepage), in order. Base each page's score/summary/fixes/meta_fix strictly on THAT page's own title and content — never repeat generic advice across pages.
Populate "engine_breakdown" with exactly the 4 entries shown. Populate "impact_effort_matrix" with 2-4 quick_wins, 2-4 strategic_growth, 1-3 low_priority — all specific to this site.

DO NOT return any text outside the JSON object. Do not wrap it in markdown fences. Return the raw JSON object string.`;

function extractTitle(html) {
  const m = html?.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim().substring(0, 200) : "";
}

function buildGeminiPrompt({ url, absoluteUrl, keyword, scrapingBlocked, scrapedText, homepageHtml, sitePages }) {
  let prompt = `Target URL: ${url}\nTarget Search Query / Keyword: ${keyword}\n\n`;
  if (scrapingBlocked || !scrapedText) {
    prompt += `[Notice: Scraper was blocked by target server. Perform a simulated GEO audit based on target URL domain metadata, niche, and known entity reputation for ${url} and target search query: ${keyword}]`;
  } else {
    prompt += `SITE PAGES:\n\n=== PAGE 1 (Homepage): ${absoluteUrl} (Title: "${extractTitle(homepageHtml)}") ===\n${scrapedText}\n`;
    sitePages.forEach((page, idx) => {
      prompt += `\n=== PAGE ${idx + 2}: ${page.url} (Title: "${page.title}") ===\n${page.text}\n`;
    });
  }
  return prompt;
}

/**
 * Run the full three-model pipeline.
 * @returns {Promise<{ report: object|null, status: string, busy: boolean, pipeline: Array }>}
 */
export async function runOptimizationPipeline(input) {
  const { providers, url, absoluteUrl, keyword, scrapingBlocked, scrapedText, homepageHtml, sitePages, crawlerStatus } = input;

  const stages = [];
  const markStage = (stage, model, status, detail) => stages.push({ stage, model, status, detail });

  // ── Stage 0: deterministic on-page SEO (no AI) — ground truth for later stages
  const homepageSeo = homepageHtml
    ? analyzeOnPageSeo(homepageHtml, absoluteUrl, keyword)
    : null;
  const pageSeoScores = (sitePages || [])
    .filter((p) => p.html)
    .map((p) => {
      const a = analyzeOnPageSeo(p.html, p.url, keyword);
      return { url: p.url, score: a.score, deductions: a.deductions.slice(0, 3) };
    });

  // ── Stage 1: Gemini Flash — core audit (backbone) ──────────────────────────
  const geminiPrompt = buildGeminiPrompt({ url, absoluteUrl, keyword, scrapingBlocked, scrapedText, homepageHtml, sitePages });
  let report = null;
  let busy = false;
  try {
    const { text, busy: geminiBusy } = await runGeminiAudit({
      apiKey: providers.gemini.apiKey,
      model: providers.gemini.model,
      systemPrompt: GEMINI_SYSTEM_PROMPT,
      prompt: geminiPrompt,
    });
    busy = geminiBusy;
    report = safeJsonParse(text);
    if (report) markStage("Full Page Crawl", `Gemini (${providers.gemini.model})`, "completed", "Parsed DOM, generated core audit + llms.txt");
    else markStage("Full Page Crawl", `Gemini (${providers.gemini.model})`, "failed", geminiBusy ? "Provider busy/rate-limited" : "Unparseable output");
  } catch (e) {
    markStage("Full Page Crawl", "Gemini", "failed", e.message);
  }

  // If Gemini produced nothing, we cannot build a report — signal upstream.
  if (!report) {
    return { report: null, status: "failed", busy, pipeline: stages };
  }

  // Attach deterministic on-page SEO + crawler status to the report.
  report.onpage_seo = homepageSeo;
  report.onpage_page_scores = pageSeoScores;
  report.crawler_status = crawlerStatus || [];

  // Stages 2 & 3 depend only on the deterministic homepage audit — run in parallel.
  const seoForModels = homepageSeo || { url: absoluteUrl, meta: {}, headings: {}, images: {}, content: {}, technical: {} };

  const qwenTask = providers.openrouter.apiKey
    ? runQwenSchema({ apiKey: providers.openrouter.apiKey, model: providers.openrouter.model, page: seoForModels, keyword })
        .then((r) => ({ ok: true, r }))
        .catch((e) => ({ ok: false, e }))
    : Promise.resolve({ ok: false, e: new Error("missing_api_key") });

  const groqTask = providers.groq.apiKey
    ? runGroqSuggestions({ apiKey: providers.groq.apiKey, model: providers.groq.model, page: seoForModels, keyword })
        .then((r) => ({ ok: true, r }))
        .catch((e) => ({ ok: false, e }))
    : Promise.resolve({ ok: false, e: new Error("missing_api_key") });

  const [qwenRes, groqRes] = await Promise.all([qwenTask, groqTask]);

  // ── Stage 2: Qwen 3 — structured data ──────────────────────────────────────
  if (qwenRes.ok) {
    report.structured_data = qwenRes.r;
    // Let Qwen's clean JSON-LD supersede Gemini's json-ld code_fix.
    if (Array.isArray(report.code_fixes) && qwenRes.r.jsonld) {
      const idx = report.code_fixes.findIndex((f) => f.type === "json-ld");
      const fix = {
        title: `${qwenRes.r.primary_type || "Structured Data"} Schema (Qwen 3)`,
        type: "json-ld",
        description: qwenRes.r.notes || "Clean, validated JSON-LD generated by Qwen 3.",
        code: qwenRes.r.jsonld,
      };
      if (idx >= 0) report.code_fixes[idx] = fix;
      else report.code_fixes.push(fix);
    }
    markStage("Structured Data & Meta", `Qwen 3 (${providers.openrouter.model})`, "completed", "Generated JSON-LD + localized schema");
  } else {
    markStage("Structured Data & Meta", "Qwen 3", providers.openrouter.apiKey ? "failed" : "skipped", qwenRes.e?.message || "no key");
  }

  // ── Stage 3: Groq / Llama — real-time suggestions ──────────────────────────
  if (groqRes.ok) {
    report.live_suggestions = groqRes.r;
    markStage("Real-Time Suggestions", `Llama via Groq (${providers.groq.model})`, "completed", "Generated titles + alt tags");
  } else {
    markStage("Real-Time Suggestions", "Llama via Groq", providers.groq.apiKey ? "failed" : "skipped", groqRes.e?.message || "no key");
  }

  report.pipeline = stages;
  return { report, status: "completed", busy: false, pipeline: stages };
}
