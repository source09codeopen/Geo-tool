// Best-effort in-memory per-IP rate limiter for the free-tier public launch.
//
// NOTE: on serverless (Vercel) each function instance has its own memory and
// cold starts reset it, so this is not a hard global guarantee — it stops
// casual hammering (someone clicking Run repeatedly, a single abusive script)
// which is the realistic threat to the shared daily AI quota. For a strict
// global limit across all instances, back this with Vercel KV / Upstash Redis.

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 5; // audits per window per IP
const hits = new Map(); // ip -> number[] of request timestamps

export function checkRateLimit(ip, { windowMs = WINDOW_MS, max = MAX_REQUESTS } = {}) {
  const now = Date.now();
  const key = ip || "unknown";
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    const retryAfterMs = windowMs - (now - recent[0]);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map can't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, ts] of hits) {
      const fresh = ts.filter((t) => now - t < windowMs);
      if (fresh.length === 0) hits.delete(k);
      else hits.set(k, fresh);
    }
  }

  return { allowed: true };
}

export function getClientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
