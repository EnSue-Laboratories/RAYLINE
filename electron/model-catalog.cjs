const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { resolveCliBin, execFileCli, buildSpawnPath } = require("./cli-bin-resolver.cjs");

async function readCodexCatalog({ root = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") } = {}) {
  try {
    const file = path.join(root, "models_cache.json");
    if ((await fs.stat(file)).size > 8 * 1024 * 1024) return [];
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    return (Array.isArray(data.models) ? data.models : []).filter((m) => m && typeof m.slug === "string" && m.visibility !== "hide").map((m) => ({
      slug: m.slug, display_name: typeof m.display_name === "string" ? m.display_name : m.slug,
      context_window: Number.isFinite(m.context_window) ? m.context_window : undefined,
      default_reasoning_level: m.default_reasoning_level,
      supported_reasoning_levels: Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels.map((level) => typeof level === "string" ? level : level?.effort) : undefined,
    }));
  } catch { return []; }
}

async function readGrokCatalog() {
  const bin = resolveCliBin("grok", { envVarName: "GROK_BIN" });
  if (!bin) return [];
  return new Promise((resolve) => {
    execFileCli(bin, ["models"], { timeout: 4000, maxBuffer: 256 * 1024, env: { ...process.env, PATH: buildSpawnPath(), NO_COLOR: "1" }, windowsHide: true }, (error, stdout) => {
      if (error) return resolve([]);
      const slugs = String(stdout || "").split(/\r?\n/).flatMap((line) => {
        const match = /^\s*[*-]\s+(grok-[a-z0-9._-]+)/i.exec(line);
        return match ? [match[1]] : [];
      });
      resolve([...new Set(slugs)]);
    });
  });
}

let pending;
let cached;
let checkedAt = 0;
async function getModelCatalog() {
  if (pending) return pending;
  if (cached && Date.now() - checkedAt < 60_000) return cached;
  pending = Promise.all([readCodexCatalog(), readGrokCatalog()]).then(([codex, grok]) => {
    cached = { codex, grok };
    checkedAt = Date.now();
    return cached;
  }).finally(() => { pending = null; });
  return pending;
}
module.exports = { getModelCatalog, readCodexCatalog };
