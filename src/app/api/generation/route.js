import { NextResponse } from "next/server";
import config from "../../../lib/config";
import { getCrawlerStatus } from "../../../lib/crawlerStatus";
import { checkRateLimit, getClientIp } from "../../../lib/rateLimit";
import { runOptimizationPipeline } from "../../../lib/ai/pipeline";
import { analyzeOnPageSeo } from "../../../lib/seo/onpage";

// Extend Vercel function timeout to 60s (Hobby plan supports up to 60s)
export const maxDuration = 60;

function extractTextFromHtml(html) {
  if (!html) return "";
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  clean = clean.replace(/<!--[\s\S]*?-->/g, " ");
  clean = clean.replace(/<[^>]+>/g, " ");
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

function extractTitleFromHtml(html) {
  const match = html?.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim().substring(0, 200) : "";
}

const NON_PAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|json|xml|pdf|zip|mp4|mp3|woff2?|ttf)$/i;

function extractSameSiteLinks(html, baseUrl, limit) {
  if (!html) return [];
  const origin = new URL(baseUrl).origin;
  const found = new Set();
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) && found.size < limit * 3) {
    const raw = match[1];
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    try {
      const resolved = new URL(raw, baseUrl);
      if (resolved.origin !== origin) continue;
      if (NON_PAGE_EXTENSIONS.test(resolved.pathname)) continue;
      resolved.hash = "";
      found.add(resolved.href);
    } catch (e) {
      // ignore malformed URLs
    }
  }
  return Array.from(found).slice(0, limit);
}

async function discoverAdditionalPages(baseUrl, homepageHtml, maxPages) {
  const origin = new URL(baseUrl).origin;

  // Prefer sitemap.xml — it's the most reliable list of real pages
  try {
    const sitemapController = new AbortController();
    const sitemapTimeout = setTimeout(() => sitemapController.abort(), 3500);
    const sitemapRes = await fetch(`${origin}/sitemap.xml`, {
      signal: sitemapController.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SynapciteBot/1.0)" },
    });
    clearTimeout(sitemapTimeout);

    if (sitemapRes.ok) {
      const xml = await sitemapRes.text();
      const locs = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1]);
      const sameSite = locs.filter((loc) => {
        try {
          return new URL(loc).origin === origin && loc !== baseUrl;
        } catch (e) {
          return false;
        }
      });
      if (sameSite.length > 0) {
        return sameSite.slice(0, maxPages);
      }
    }
  } catch (e) {
    // sitemap unavailable — fall through to link crawling
  }

  return extractSameSiteLinks(homepageHtml, baseUrl, maxPages);
}

async function scrapePageForReport(pageUrl, maxChars) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    return {
      url: pageUrl,
      title: extractTitleFromHtml(html),
      text: extractTextFromHtml(html).substring(0, maxChars),
      // Kept (capped) so the deterministic on-page SEO analyzer can inspect
      // each page's real markup — headings, alt tags, meta, etc.
      html: html.substring(0, 120000),
    };
  } catch (e) {
    return null;
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { url, keyword, engines = ["chatgpt", "perplexity", "google"] } = body;

    if (!url || !keyword) {
      return new NextResponse("URL and Keyword are required", { status: 400 });
    }

    // Per-IP throttle so one visitor can't drain the shared daily AI quota.
    const rl = checkRateLimit(getClientIp(req));
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "rate_limited_ip",
          message: `You're running audits too quickly. Please wait ${rl.retryAfterSec}s and try again.`,
        },
        { status: 429 },
      );
    }

    // 1. Perform Scrape (homepage) + discover & scrape up to 9 additional site pages
    let scrapedText = "";
    let scrapingBlocked = false;
    let homepageHtml = "";
    let absoluteUrl = url;
    if (!/^https?:\/\//i.test(url)) {
      absoluteUrl = `https://${url}`;
    }

    try {
      const scrapeController = new AbortController();
      const scrapeTimeout = setTimeout(() => scrapeController.abort(), 5000);

      const scrapeRes = await fetch(absoluteUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        next: { revalidate: 60 },
        signal: scrapeController.signal,
      });
      clearTimeout(scrapeTimeout);

      if (scrapeRes.ok) {
        homepageHtml = await scrapeRes.text();
        const text = extractTextFromHtml(homepageHtml);
        scrapedText = text.substring(0, 5000);
      } else {
        scrapingBlocked = true;
      }
    } catch (scrapeErr) {
      console.warn("Internal scraper failed, falling back to simulated check:", scrapeErr.message);
      scrapingBlocked = true;
    }

    // Full-site scan + real crawler-permission check run concurrently to stay
    // within the 60s function budget (both are independent of the AI call).
    const discoverPages = async () => {
      if (scrapingBlocked) return [];
      try {
        const additionalUrls = await discoverAdditionalPages(absoluteUrl, homepageHtml, 9);
        const scraped = await Promise.all(
          additionalUrls.map((pageUrl) => scrapePageForReport(pageUrl, 2000)),
        );
        return scraped.filter((p) => p && p.text);
      } catch (e) {
        console.warn("Site-wide page discovery failed:", e.message);
        return [];
      }
    };

    const [sitePages, crawlerStatus] = await Promise.all([
      discoverPages(),
      getCrawlerStatus(new URL(absoluteUrl).origin).catch((e) => {
        console.warn("Crawler status check failed:", e.message);
        return [];
      }),
    ]);

    // 2. Run the three-model optimization pipeline (Gemini → Qwen 3 → Groq/Llama).
    const geminiKey = config.ai.providers.gemini.apiKey;
    const hasGemini = geminiKey && !geminiKey.includes("your_") && geminiKey.trim() !== "";

    if (hasGemini) {
      const { report, status, busy } = await runOptimizationPipeline({
        providers: config.ai.providers,
        url,
        absoluteUrl,
        keyword,
        engines,
        scrapingBlocked,
        scrapedText,
        homepageHtml,
        sitePages,
        crawlerStatus,
      });

      if (status === "failed") {
        if (busy) {
          return NextResponse.json(
            {
              error: "service_busy",
              message: "The audit service is experiencing high demand right now. Please try again in a minute.",
            },
            { status: 429 },
          );
        }
        return NextResponse.json({ reportData: "", status: "failed" });
      }

      return NextResponse.json({
        reportData: JSON.stringify(report),
        status: "completed",
      });
    }

    // 3. Mock mode fallback — no Gemini key configured.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const homepageSeo = homepageHtml ? analyzeOnPageSeo(homepageHtml, absoluteUrl, keyword) : null;
    const mockReport = buildMockReport({ url, absoluteUrl, keyword, homepageHtml, sitePages, crawlerStatus, homepageSeo });
    return NextResponse.json({
      reportData: JSON.stringify(mockReport),
      status: "completed",
    });
  } catch (error) {
    console.error("[GENERATION_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

function buildMockReport({ url, absoluteUrl, keyword, homepageHtml, sitePages, crawlerStatus, homepageSeo }) {
  const rand = (min, span) => Math.floor(Math.random() * span) + min;
  return {
    visibility_score: rand(55, 35),
    eeat_score: rand(60, 30),
    citation_likelihood: rand(45, 40),
    readability_score: rand(75, 20),
    summary: `Mock AI Visibility Audit for ${url} on keyword "${keyword}". Configure GEMINI_API_KEY (plus OPENROUTER_API_KEY and GROQ_API_KEY for the full pipeline) to run real analysis.`,
    strengths: [
      "Logical HTML document structure with standard paragraph wrappers.",
      "High density of keywords matching the search intent.",
    ],
    weaknesses: [
      "No structured JSON-LD Schema markup declaring entities.",
      "Crawler rules in robots.txt do not explicitly list modern AI crawlers (e.g. GPTBot).",
    ],
    technical_audit: {
      robots_txt: "Crawler settings present but standard only.",
      schema_markup: "Missing structured Schema markup.",
      sitemap: "Sitemap xml path not declared in header meta.",
    },
    engine_breakdown: [
      { engine: "ChatGPT Search", score: rand(50, 30), note: "OAI-SearchBot can reach the page, but thin structured data limits citation confidence." },
      { engine: "Perplexity AI", score: rand(40, 30), note: "Lacks the academic/authority signal density Perplexity favors for citations." },
      { engine: "Google Gemini / AI Overviews", score: rand(55, 30), note: "Moderate organic signal, but missing Knowledge Graph entity presence." },
      { engine: "Claude", score: rand(35, 30), note: "No llms.txt and inconsistent heading structure reduce Claude's parsing confidence." },
    ],
    impact_effort_matrix: {
      quick_wins: ["Deploy an llms.txt file.", "Unblock GPTBot and PerplexityBot in robots.txt.", "Fix duplicate/missing title tags site-wide."],
      strategic_growth: ["Build a full JSON-LD entity graph.", "Publish original research to strengthen E-E-A-T."],
      low_priority: ["Minor heading syntax cleanup on low-traffic utility pages."],
    },
    code_fixes: [
      { title: "Add Organization Schema", type: "json-ld", description: "Gives AI crawlers a structured entity to cite.", code: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "${url}",\n  "url": "${absoluteUrl}"\n}\n</script>` },
      { title: "Welcome AI Crawlers in robots.txt", type: "robots-txt", description: "Explicitly allows the major AI search crawlers.", code: `User-agent: GPTBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: CCBot\nAllow: /` },
      { title: "Add an llms.txt file", type: "llms-txt", description: "Summarizes your site for LLMs in the emerging llms.txt standard.", code: `# ${url}\n\n> Summary of the site for the keyword "${keyword}".\n\n## Key Pages\n- Home: ${absoluteUrl}` },
      { title: "Optimize Title & Meta Description", type: "meta-tags", description: "Aligns on-page metadata with the target keyword.", code: `<title>${keyword} | ${url}</title>\n<meta name="description" content="Learn about ${keyword} on ${url}. Clear, authoritative, and up to date." />` },
    ],
    page_reports: [
      {
        url: absoluteUrl,
        title: extractTitleFromHtml(homepageHtml) || url,
        visibility_score: rand(55, 35),
        summary: `Homepage covers "${keyword}" but lacks structured entity markup for AI citation.`,
        fixes: ["Add Organization schema to the homepage <head>.", "Mention the target keyword in the first 100 words.", "Add an FAQ section addressing common questions."],
        meta_fix: { title: `${keyword} | ${url}`, description: `Learn about ${keyword} on ${url}. Clear, authoritative, and up to date.` },
      },
      ...sitePages.slice(0, 2).map((page) => ({
        url: page.url,
        title: page.title || page.url,
        visibility_score: rand(50, 35),
        summary: `This page's content is only loosely tied to "${keyword}", reducing AI citation relevance.`,
        fixes: [`Align the page title more closely with "${keyword}".`, "Add descriptive alt text and headings.", "Link back to the homepage with keyword-rich anchor text."],
        meta_fix: { title: `${page.title || keyword} | ${url}`, description: `${page.title || "This page"} covers ${keyword}-related information on ${url}.` },
      })),
    ],
    onpage_seo: homepageSeo,
    onpage_page_scores: [],
    crawler_status: crawlerStatus || [],
    pipeline: [
      { stage: "Full Page Crawl", model: "Gemini (mock)", status: "skipped", detail: "No GEMINI_API_KEY configured" },
      { stage: "Structured Data & Meta", model: "Qwen 3", status: "skipped", detail: "mock mode" },
      { stage: "Real-Time Suggestions", model: "Llama via Groq", status: "skipped", detail: "mock mode" },
    ],
  };
}
