// Minimal client for OpenAI-compatible chat-completion APIs.
// Both Groq (Llama) and OpenRouter (Qwen 3) speak this exact protocol, so the
// Qwen and Groq stage clients share this one caller.

export async function chatCompletion({
  endpoint,
  apiKey,
  model,
  system,
  user,
  temperature = 0.4,
  maxTokens = 2048,
  json = false,
  timeoutMs = 20000,
  extraHeaders = {},
}) {
  if (!apiKey || apiKey.includes("your_") || apiKey.trim() === "") {
    throw new Error("missing_api_key");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: "json_object" };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const err = new Error(`upstream_${res.status}`);
      err.status = res.status;
      err.body = errText.slice(0, 300);
      throw err;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty_completion");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

// Strip ```json fences and parse. Returns null on failure (never throws) so
// pipeline stages can degrade gracefully.
export function safeJsonParse(str) {
  if (!str) return null;
  let cleaned = str.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\n/, "").replace(/\n```$/, "").trim();
  }
  // Grab the outermost JSON object/array if there's surrounding prose.
  const firstBrace = cleaned.search(/[{[]/);
  const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}
