import { NextResponse } from "next/server";
import config from "../../../lib/config";

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
    };
  } catch (e) {
    return null;
  }
}

function cleanJsonString(str) {
  if (!str) return "";
  let cleaned = str.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\n/, ""); // Remove opening ```json
    cleaned = cleaned.replace(/\n```$/, ""); // Remove closing ```
    cleaned = cleaned.trim();
  }
  return cleaned;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { url, keyword, engines = ["chatgpt", "perplexity", "google"] } = body;

    if (!url || !keyword) {
      return new NextResponse("URL and Keyword are required", { status: 400 });
    }

    // 2. Perform Scrape (homepage) + discover & scrape up to 9 additional site pages
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

    // Full-site scan: discover up to 9 more pages (10 total incl. homepage) and scrape them in parallel
    let sitePages = [];
    if (!scrapingBlocked) {
      try {
        const additionalUrls = await discoverAdditionalPages(absoluteUrl, homepageHtml, 9);
        const scraped = await Promise.all(
          additionalUrls.map((pageUrl) => scrapePageForReport(pageUrl, 2000)),
        );
        sitePages = scraped.filter((p) => p && p.text);
      } catch (e) {
        console.warn("Site-wide page discovery failed:", e.message);
      }
    }

    // 3. Prepare Prompts
    const systemPrompt = `You are an expert Generative Engine Optimization (GEO) auditor and AI Search Visibility specialist.
Your task is to analyze the scraped website text and evaluate how well it is optimized to be cited, referenced, and surfaced in AI-driven search answers (ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini) for the user's target search query.

You MUST respond with a single, valid JSON object matching this schema exactly:
{
  "visibility_score": 85, 
  "eeat_score": 75, 
  "citation_likelihood": 65, 
  "readability_score": 90, 
  "summary": "Short overview summarizing the website's AI search readiness...",
  "strengths": [
    "Strength item 1",
    "Strength item 2"
  ],
  "weaknesses": [
    "Weakness item 1",
    "Weakness item 2"
  ],
  "technical_audit": {
    "robots_txt": "Status profile here",
    "schema_markup": "Status profile here",
    "sitemap": "Status profile here"
  },
  "recommendations": [
    {
      "area": "Category area",
      "priority": "High/Medium/Low",
      "tips": "Detailed recommendation text..."
    }
  ],
  "code_fixes": [
    {
      "title": "Short title, e.g. 'Add Organization Schema'",
      "type": "json-ld",
      "description": "One sentence on why this specific fix helps AI citation for this page.",
      "code": "Complete, ready-to-paste code. For json-ld: a full <script type=\\"application/ld+json\\">...</script> block populated with real values inferred from the scraped page (name, description, url) — never placeholders like 'Your Company'."
    }
  ],
  "page_reports": [
    {
      "url": "Exact URL of the page as given below",
      "title": "The page's actual <title> text",
      "visibility_score": 70,
      "summary": "One sentence on this specific page's AI search visibility, based on ITS OWN title/content and how well it targets the keyword.",
      "fixes": [
        "Specific, actionable fix tailored to THIS page's actual title/content (not generic)",
        "Second specific fix for this page",
        "Third specific fix for this page"
      ]
    }
  ]
}

Populate "code_fixes" with exactly these 4 entries, tailored to the actual scraped page content, target keyword, and target URL (never generic placeholders):
1. type "json-ld": A complete Organization or WebPage JSON-LD block (as a full <script> tag) reflecting the real page content.
2. type "robots-txt": Concrete robots.txt lines that explicitly allow the major AI crawlers — GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Amazonbot — plus the existing site structure if inferable.
3. type "llms-txt": A draft /llms.txt file (the emerging llms.txt standard) summarizing the site's purpose, key pages, and the target keyword's topic for LLM consumption.
4. type "meta-tags": Improved <title> and <meta name="description"> tags optimized for the target keyword and AI citation, sized appropriately (title ~50-60 chars, description ~150-160 chars).

Populate "page_reports" with ONE entry for EVERY page listed under "SITE PAGES" below (including the homepage), in the same order. Base each page's score, summary, and fixes strictly on THAT page's own title and content — never repeat the same generic advice across pages; each page's fixes must reference something specific to its own title/content.

DO NOT return any text outside of the JSON object. Do not wrap the JSON object in markdown blocks like \`\`\`json ... \`\`\`. Just return the raw JSON object string.`;

    let prompt = `Target URL: ${url}\nTarget Search Query / Keyword: ${keyword}\n\n`;
    if (scrapingBlocked || !scrapedText) {
      prompt += `[Notice: Scraper was blocked by target server. Perform a simulated GEO audit based on target URL domain metadata, niche, and known entity reputation for ${url} and target search query: ${keyword}]`;
    } else {
      prompt += `SITE PAGES:\n\n=== PAGE 1 (Homepage): ${absoluteUrl} (Title: "${extractTitleFromHtml(homepageHtml)}") ===\n${scrapedText}\n`;
      sitePages.forEach((page, idx) => {
        prompt += `\n=== PAGE ${idx + 2}: ${page.url} (Title: "${page.title}") ===\n${page.text}\n`;
      });
    }

    // 4. Submit to Google Gemini Flash API (or fallback to MuAPI / Mock)
    const apiKey = config.ai.apiKey;
    let reportData = "";
    let requestId = `gemini_${Date.now()}`;
    let status = "completed";

    if (apiKey && !apiKey.includes("your_") && apiKey.trim() !== "") {
      try {
        // Detect if key is a Gemini API Key (starts with AIzaSy or configured via GEMINI_API_KEY)
        const isGeminiKey = apiKey.startsWith("AIzaSy") || Boolean(process.env.GEMINI_API_KEY) || !process.env.MUAPIAPP_API_KEY;

        if (isGeminiKey) {
          const modelName = config.ai.model || "gemini-2.0-flash";
          const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

          const geminiController = new AbortController();
          const geminiTimeout = setTimeout(() => geminiController.abort(), 40000);

          let geminiRes;
          try {
            geminiRes = await fetch(geminiEndpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [
                  {
                    role: "user",
                    parts: [
                      {
                        text: `${systemPrompt}\n\n${prompt}`
                      }
                    ]
                  }
                ],
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 0.7,
                  maxOutputTokens: 8192
                }
              }),
              signal: geminiController.signal,
            });
          } finally {
            clearTimeout(geminiTimeout);
          }

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const textOutput = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textOutput) {
              reportData = textOutput;
              status = "completed";
            } else {
              throw new Error("Empty candidate output from Gemini API");
            }
          } else {
            const errBody = await geminiRes.text();
            console.error("Gemini API error:", geminiRes.status, errBody);
            throw new Error(`Gemini API error status: ${geminiRes.status}`);
          }
        } else {
          // Legacy MuAPI fallback
          const webhookUrl = `${config.auth.webhook_url}/api/webhook/muapi`;
          const submitUrl = `https://api.muapi.ai/api/v1/any-llm-models?webhook=${encodeURIComponent(webhookUrl)}`;

          const inputPayload = {
            prompt,
            system_prompt: systemPrompt,
            model: "google/gemini-2.5-flash",
            temperature: 1
          };

          const submitController = new AbortController();
          const submitTimeout = setTimeout(() => submitController.abort(), 15000);

          let submitRes;
          try {
            submitRes = await fetch(submitUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey
              },
              body: JSON.stringify(inputPayload),
              signal: submitController.signal,
            });
          } finally {
            clearTimeout(submitTimeout);
          }

          if (submitRes.ok) {
            const resJson = await submitRes.json();
            const reqId = resJson.request_id || resJson.id;
            if (reqId) {
              requestId = reqId;

              // Poll for result (max 15s)
              let completed = false;
              let attempts = 0;
              const maxAttempts = 6;

              while (!completed && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2500));
                attempts++;

                try {
                  const pollRes = await fetch(`https://api.muapi.ai/api/v1/predictions/${requestId}/result`, {
                    method: "GET",
                    headers: {
                      "Content-Type": "application/json",
                      "x-api-key": apiKey
                    }
                  });

                  if (pollRes.ok) {
                    const pollJson = await pollRes.json();
                    const state = pollJson.status || pollJson.state;
                    if (state === "completed" || state === "succeeded") {
                      const outputs = pollJson.outputs || [];
                      const rawOutput = outputs[0] || pollJson.output;
                      let outputText = "";
                      if (typeof rawOutput === "string") {
                        outputText = rawOutput;
                      } else if (rawOutput && rawOutput.text) {
                        outputText = rawOutput.text;
                      } else if (pollJson.result) {
                        outputText = typeof pollJson.result === "string" ? pollJson.result : JSON.stringify(pollJson.result);
                      }
                      if (outputText) {
                        reportData = outputText;
                        status = "completed";
                        completed = true;
                      }
                    } else if (state === "failed") {
                      console.error("MuAPI generation failed:", pollJson.error);
                      status = "failed";
                      break;
                    }
                  }
                } catch (pollErr) {
                  console.error("MuAPI polling error:", pollErr);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("AI generation failed:", err.message);
      }

      if (!reportData || reportData.trim() === "") {
        status = "failed";
      }
    } else {
      // Mock mode fallback
      await new Promise(resolve => setTimeout(resolve, 3000));
      reportData = JSON.stringify({
        visibility_score: Math.floor(Math.random() * 35) + 55,
        eeat_score: Math.floor(Math.random() * 30) + 60,
        citation_likelihood: Math.floor(Math.random() * 40) + 45,
        readability_score: Math.floor(Math.random() * 20) + 75,
        summary: `Mock AI Visibility Audit for ${url} on keyword "${keyword}". The site shows reasonable structure but has gaps in modern AI-crawler discovery markup.`,
        strengths: [
          "Logical HTML document structure with standard paragraph wrappers.",
          "High density of keywords matching the search intent."
        ],
        weaknesses: [
          "No structured JSON-LD Schema markup declaring entities.",
          "Crawler rules in robots.txt do not explicitly list modern AI crawlers (e.g. GPTBot)."
        ],
        technical_audit: {
          robots_txt: "Crawler settings present but standard only.",
          schema_markup: "Missing structured Schema markup.",
          sitemap: "Sitemap xml path not declared in header meta."
        },
        recommendations: [
          {
            area: "Technical GEO",
            priority: "High",
            tips: "Configure robots.txt to explicitly welcome AI parsers (e.g. GPTBot, PerplexityBot) and reference a clean LLM text standard file."
          },
          {
            area: "Entity & Schema",
            priority: "Medium",
            tips: "Inject Organization and FAQ Schema structures to allow crawlers to easily extract key organizational entities and questions/answers."
          }
        ],
        code_fixes: [
          {
            title: "Add Organization Schema",
            type: "json-ld",
            description: "Gives AI crawlers a structured, unambiguous entity to cite for your brand.",
            code: `<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "${url}",\n  "url": "https://${url}"\n}\n</script>`
          },
          {
            title: "Welcome AI Crawlers in robots.txt",
            type: "robots-txt",
            description: "Explicitly allows the major AI search crawlers to index this page for citation.",
            code: `User-agent: GPTBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: CCBot\nAllow: /`
          },
          {
            title: "Add an llms.txt file",
            type: "llms-txt",
            description: "Summarizes your site for LLMs in the emerging llms.txt standard, improving how AI engines understand and cite your content.",
            code: `# ${url}\n\n> Summary of the site for the keyword "${keyword}".\n\n## Key Pages\n- Home: https://${url}`
          },
          {
            title: "Optimize Title & Meta Description",
            type: "meta-tags",
            description: "Aligns your on-page metadata with the target keyword to improve AI citation relevance.",
            code: `<title>${keyword} | ${url}</title>\n<meta name="description" content="Learn about ${keyword} on ${url}. Clear, authoritative, and up to date." />`
          }
        ],
        page_reports: [
          {
            url: absoluteUrl,
            title: extractTitleFromHtml(homepageHtml) || url,
            visibility_score: Math.floor(Math.random() * 35) + 55,
            summary: `Homepage covers "${keyword}" but lacks structured entity markup for AI citation.`,
            fixes: [
              "Add Organization schema to the homepage <head>.",
              "Mention the target keyword in the first 100 words of visible copy.",
              "Add an FAQ section addressing common questions about the keyword."
            ]
          },
          ...sitePages.slice(0, 2).map((page) => ({
            url: page.url,
            title: page.title || page.url,
            visibility_score: Math.floor(Math.random() * 35) + 50,
            summary: `This page's content is only loosely tied to "${keyword}", reducing AI citation relevance.`,
            fixes: [
              `Align the page title more closely with "${keyword}".`,
              "Add descriptive alt text and headings referencing the target topic.",
              "Link back to the homepage with keyword-rich anchor text."
            ]
          }))
        ]
      });
      status = "completed";
    }

    // 5. Return report directly (no persistence — audits are stateless/anonymous)
    const cleanedReport = cleanJsonString(reportData);

    return NextResponse.json({
      reportData: cleanedReport,
      status,
    });

  } catch (error) {
    console.error("[GENERATION_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
