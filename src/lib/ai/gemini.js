// Pipeline stage 1 — Gemini Flash.
// Role: parse the heavy, full-page DOM (homepage + crawled site pages) and
// produce the core GEO audit JSON, including the generated /llms.txt draft.

// Google's Gemini API occasionally returns 503 "high demand" during traffic
// spikes. Retry ONLY on those fast upstream failures (503/429) — a full audit
// prompt legitimately takes 20-35s, so a timeout (AbortError) means the call
// was working, not failing; retrying would just burn the serverless budget.
async function fetchGeminiWithRetry(
  endpoint,
  requestBody,
  { timeoutMs = 40000, maxAttempts = 2, retryDelayMs = 1500 } = {},
) {
  let lastRes = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if ((res.status === 503 || res.status === 429) && attempt < maxAttempts) {
        lastRes = res;
        await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
  return lastRes;
}

/**
 * @returns {Promise<{ text: string, busy: boolean }>}
 *   text  = raw JSON string from Gemini ("" on failure)
 *   busy  = true when the provider was rate-limited/overloaded (429/503)
 */
export async function runGeminiAudit({ apiKey, model, systemPrompt, prompt }) {
  const modelName = model || "gemini-2.5-flash-lite";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const res = await fetchGeminiWithRetry(endpoint, {
    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  });

  if (!res) return { text: "", busy: true };

  if (res.ok) {
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { text, busy: false };
  }

  const errBody = await res.text().catch(() => "");
  console.error("Gemini API error:", res.status, errBody);
  return { text: "", busy: res.status === 429 || res.status === 503 };
}
