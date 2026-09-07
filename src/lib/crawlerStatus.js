export const TARGET_BOTS = ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended", "CCBot"];

async function fetchRobotsTxt(origin) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SynapciteBot/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 403 || res.status === 429) {
      return { text: null, restricted: true };
    }
    if (!res.ok) return { text: null, restricted: false };
    return { text: await res.text(), restricted: false };
  } catch (e) {
    return { text: null, restricted: false };
  }
}

function parseRobotsBlocks(text) {
  const blocks = {};
  let currentAgents = [];
  let sawDirectiveSinceLastAgent = true;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      if (sawDirectiveSinceLastAgent) {
        currentAgents = [value.toLowerCase()];
        sawDirectiveSinceLastAgent = false;
      } else {
        currentAgents.push(value.toLowerCase());
      }
    } else if (key === "allow" || key === "disallow") {
      sawDirectiveSinceLastAgent = true;
      currentAgents.forEach((agent) => {
        if (!blocks[agent]) blocks[agent] = [];
        blocks[agent].push({ type: key, path: value });
      });
    }
  }

  return blocks;
}

function botStatus(blocks, botNameLower) {
  const rules = blocks[botNameLower] || blocks["*"];
  if (!rules || rules.length === 0) return "Allowed";

  const hasFullDisallow = rules.some((r) => r.type === "disallow" && r.path === "/");
  const hasFullAllowOverride = rules.some((r) => r.type === "allow" && r.path === "/");

  return hasFullDisallow && !hasFullAllowOverride ? "Blocked" : "Allowed";
}

export async function getCrawlerStatus(origin) {
  const robotsResult = await fetchRobotsTxt(origin);

  if (robotsResult.restricted) {
    return TARGET_BOTS.map((bot) => ({ bot, status: "Restricted" }));
  }
  if (!robotsResult.text) {
    return TARGET_BOTS.map((bot) => ({ bot, status: "Allowed" }));
  }

  const blocks = parseRobotsBlocks(robotsResult.text);
  return TARGET_BOTS.map((bot) => ({ bot, status: botStatus(blocks, bot.toLowerCase()) }));
}
