// Deterministic on-page SEO analyzer.
//
// This runs BEFORE any LLM call and extracts hard, measurable on-page SEO
// signals straight from the raw HTML — no AI guessing. The LLM stages later
// use this structured audit as ground truth so their suggestions (titles, alt
// tags, JSON-LD) are grounded in what the page actually contains.

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "up", "about", "into", "over", "after", "is", "are",
  "was", "were", "be", "been", "being", "this", "that", "these", "those", "it",
  "its", "as", "if", "then", "than", "so", "you", "your", "we", "our", "they",
  "their", "he", "she", "his", "her", "i", "me", "my", "us", "will", "can",
  "not", "no", "yes", "do", "does", "did", "have", "has", "had", "all", "any",
]);

function attr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = tag.match(re);
  return m ? m[1].trim() : null;
}

function stripToText(html) {
  if (!html) return "";
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  clean = clean.replace(/<!--[\s\S]*?-->/g, " ");
  clean = clean.replace(/<[^>]+>/g, " ");
  clean = clean.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&");
  clean = clean.replace(/\s+/g, " ").trim();
  return clean;
}

// ── Meta / head signals ────────────────────────────────────────────────────
function analyzeMeta(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  let description = "";
  let canonical = "";
  let robots = "";
  let viewport = "";
  const openGraph = {};
  const twitter = {};

  for (const tag of metaTags) {
    const name = (attr(tag, "name") || "").toLowerCase();
    const property = (attr(tag, "property") || "").toLowerCase();
    const content = attr(tag, "content") || "";
    if (name === "description") description = content;
    if (name === "robots") robots = content;
    if (name === "viewport") viewport = content;
    if (property.startsWith("og:")) openGraph[property.slice(3)] = content;
    if (name.startsWith("twitter:")) twitter[name.slice(8)] = content;
  }

  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    if ((attr(tag, "rel") || "").toLowerCase() === "canonical") {
      canonical = attr(tag, "href") || "";
    }
  }

  const langMatch = html.match(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i);
  const lang = langMatch ? langMatch[1] : "";

  return {
    title,
    title_length: title.length,
    description,
    description_length: description.length,
    canonical,
    robots,
    has_viewport: Boolean(viewport),
    lang,
    open_graph: openGraph,
    twitter_card: twitter,
    og_complete: Boolean(openGraph.title && openGraph.description && openGraph.image),
    twitter_complete: Boolean(twitter.card && (twitter.title || openGraph.title)),
  };
}

// ── Heading structure (H1–H6) ──────────────────────────────────────────────
function analyzeHeadings(html) {
  const headings = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html)) && headings.length < 200) {
    const text = stripToText(m[2]);
    if (text) headings.push({ level: Number(m[1]), text: text.slice(0, 160) });
  }
  const counts = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };
  headings.forEach((h) => (counts[`h${h.level}`] += 1));

  // Detect skipped levels (e.g. an H4 that follows an H2 with no H3 between).
  const issues = [];
  if (counts.h1 === 0) issues.push("Page has no <h1> — every page should have exactly one.");
  if (counts.h1 > 1) issues.push(`Page has ${counts.h1} <h1> tags — use exactly one primary heading.`);
  let prev = 0;
  for (const h of headings) {
    if (prev && h.level > prev + 1) {
      issues.push(`Heading level jumps from H${prev} to H${h.level} ("${h.text.slice(0, 40)}") — avoid skipping levels.`);
      break;
    }
    prev = h.level;
  }

  return { counts, outline: headings.slice(0, 40), issues };
}

// ── Images / alt-tag coverage ──────────────────────────────────────────────
function analyzeImages(html) {
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const missing = [];
  let withAlt = 0;
  for (const tag of imgTags) {
    const alt = attr(tag, "alt");
    const src = attr(tag, "src") || attr(tag, "data-src") || "";
    if (alt && alt.trim()) withAlt += 1;
    else missing.push(src.slice(0, 200));
  }
  const total = imgTags.length;
  return {
    total,
    with_alt: withAlt,
    missing_alt: total - withAlt,
    coverage_pct: total ? Math.round((withAlt / total) * 100) : 100,
    missing_alt_srcs: missing.slice(0, 20),
  };
}

// ── Links (internal vs external) ───────────────────────────────────────────
function analyzeLinks(html, baseUrl) {
  let origin = "";
  try {
    origin = new URL(baseUrl).origin;
  } catch (e) {
    origin = "";
  }
  const anchors = html.match(/<a\b[^>]*href\s*=\s*["'][^"']*["'][^>]*>/gi) || [];
  let internal = 0;
  let external = 0;
  let nofollow = 0;
  let emptyAnchor = 0;
  for (const tag of anchors) {
    const href = attr(tag, "href") || "";
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    const rel = (attr(tag, "rel") || "").toLowerCase();
    if (rel.includes("nofollow")) nofollow += 1;
    try {
      const resolved = new URL(href, baseUrl);
      if (origin && resolved.origin === origin) internal += 1;
      else external += 1;
    } catch (e) {
      // relative or malformed — treat as internal
      internal += 1;
    }
  }
  return { total: internal + external, internal, external, nofollow, emptyAnchor };
}

// ── Keyword density & word count ───────────────────────────────────────────
function analyzeContent(html, keyword) {
  const text = stripToText(html);
  const words = text.toLowerCase().match(/[a-z0-9'-]+/g) || [];
  const wordCount = words.length;

  // Top non-stopword tokens
  const freq = new Map();
  for (const w of words) {
    if (w.length < 3 || STOP_WORDS.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  const topKeywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({
      word,
      count,
      density_pct: wordCount ? Number(((count / wordCount) * 100).toFixed(2)) : 0,
    }));

  // Target keyword density (supports multi-word phrases)
  let keywordDensity = 0;
  let keywordCount = 0;
  if (keyword) {
    const kw = keyword.toLowerCase().trim();
    const kwWords = kw.split(/\s+/).length;
    const haystack = " " + words.join(" ") + " ";
    const re = new RegExp(`(?<=\\s)${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s)`, "g");
    keywordCount = (haystack.match(re) || []).length;
    keywordDensity = wordCount ? Number(((keywordCount * kwWords / wordCount) * 100).toFixed(2)) : 0;
  }

  return {
    word_count: wordCount,
    text_sample: text.slice(0, 400),
    top_keywords: topKeywords,
    target_keyword: keyword || "",
    target_keyword_count: keywordCount,
    target_keyword_density_pct: keywordDensity,
  };
}

// ── Readability (Flesch Reading Ease, approximate) ─────────────────────────
function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = word.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

function analyzeReadability(html) {
  const text = stripToText(html);
  const sentences = (text.match(/[.!?]+(?:\s|$)/g) || []).length || 1;
  const words = text.match(/[a-z0-9'-]+/gi) || [];
  const wordCount = words.length || 1;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);

  const flesch =
    206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount);
  const score = Math.max(0, Math.min(100, Math.round(flesch)));

  let grade = "Very difficult";
  if (score >= 90) grade = "Very easy";
  else if (score >= 70) grade = "Easy";
  else if (score >= 60) grade = "Standard";
  else if (score >= 50) grade = "Fairly difficult";
  else if (score >= 30) grade = "Difficult";

  return {
    flesch_reading_ease: score,
    grade,
    avg_sentence_length: Number((wordCount / sentences).toFixed(1)),
    avg_syllables_per_word: Number((syllables / wordCount).toFixed(2)),
  };
}

// ── Technical on-page signals ──────────────────────────────────────────────
function analyzeTechnical(html) {
  const hasJsonLd = /<script[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html);
  const jsonLdBlocks = (html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []).length;
  const hasHttps = true; // fetched over https in the route
  const inlineStyleCount = (html.match(/style\s*=\s*["']/gi) || []).length;
  const favicon = /<link[^>]*rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(html);

  return {
    has_json_ld: hasJsonLd,
    json_ld_blocks: jsonLdBlocks,
    has_favicon: favicon,
    inline_style_count: inlineStyleCount,
    https: hasHttps,
  };
}

// ── Composite on-page SEO score ────────────────────────────────────────────
function scoreOnPage(a) {
  let score = 100;
  const deductions = [];
  const push = (points, reason) => {
    score -= points;
    deductions.push({ points, reason });
  };

  if (!a.meta.title) push(15, "Missing <title> tag.");
  else if (a.meta.title_length < 30 || a.meta.title_length > 65)
    push(6, `Title length ${a.meta.title_length} chars is outside the ideal 30–60 range.`);

  if (!a.meta.description) push(12, "Missing meta description.");
  else if (a.meta.description_length < 70 || a.meta.description_length > 165)
    push(5, `Meta description ${a.meta.description_length} chars is outside the ideal 70–160 range.`);

  if (!a.meta.canonical) push(6, "No canonical URL declared.");
  if (!a.meta.og_complete) push(6, "Incomplete Open Graph tags (title/description/image).");
  if (!a.meta.twitter_complete) push(4, "Missing or incomplete Twitter Card tags.");
  if (!a.meta.has_viewport) push(4, "No responsive viewport meta tag.");
  if (!a.meta.lang) push(3, "No <html lang> attribute.");

  if (a.headings.counts.h1 !== 1) push(8, "Page does not have exactly one <h1>.");
  score -= Math.min(6, a.headings.issues.length * 3);

  if (a.images.total > 0 && a.images.coverage_pct < 100)
    push(Math.min(12, Math.round((a.images.missing_alt / a.images.total) * 12)),
      `${a.images.missing_alt}/${a.images.total} images missing alt text.`);

  if (!a.technical.has_json_ld) push(8, "No JSON-LD structured data found.");
  if (a.content.word_count < 300) push(6, `Thin content — only ${a.content.word_count} words.`);
  if (a.content.target_keyword && a.content.target_keyword_count === 0)
    push(6, `Target keyword "${a.content.target_keyword}" not found in body content.`);

  return { score: Math.max(0, Math.round(score)), deductions };
}

/**
 * Run the full deterministic on-page SEO analysis for a single page's HTML.
 * @param {string} html raw HTML string
 * @param {string} url the page's URL (for internal/external link resolution)
 * @param {string} keyword target keyword/phrase
 */
export function analyzeOnPageSeo(html, url, keyword) {
  const meta = analyzeMeta(html);
  const headings = analyzeHeadings(html);
  const images = analyzeImages(html);
  const links = analyzeLinks(html, url);
  const content = analyzeContent(html, keyword);
  const readability = analyzeReadability(html);
  const technical = analyzeTechnical(html);

  const partial = { meta, headings, images, links, content, readability, technical };
  const { score, deductions } = scoreOnPage(partial);

  return { url, score, deductions, ...partial };
}
