const { withSystemProxy } = require("./runtime-env.cjs");
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

function parseGrokCatalog(stdout) {
  return [...new Set(String(stdout || "").replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/).flatMap((line) => {
    const match = /^\s*[*-]\s+(grok-[a-z0-9._-]+)(?:\s|$)/i.exec(line);
    return match ? [match[1]] : [];
  }))];
}
async function readGrokCatalog({ bin = resolveCliBin("grok", { envVarName: "GROK_BIN" }), runCli = execFileCli } = {}) {
  if (!bin) return [];
  return new Promise((resolve) => {
    runCli(bin, ["models"], { timeout: 4000, maxBuffer: 256 * 1024, env: { ...process.env, PATH: buildSpawnPath(), NO_COLOR: "1" }, windowsHide: true }, (error, stdout) => {
      resolve(error ? [] : parseGrokCatalog(stdout));
    });
  });
}

function parseAgyCatalog(stdout) {
  return [...new Map(String(stdout).split(/\r?\n/).flatMap((line) => {
    const match = /^([a-z0-9][a-z0-9._-]*)\t(.+)$/i.exec(line.trim());
    return match ? [[match[1], { slug: match[1], name: match[2].trim().slice(0, 160) }]] : [];
  })).values()];
}
async function readAgyCatalog({ cacheFile = path.join(os.homedir(), ".cache", "rayline", "agy-models.json"), bin = resolveCliBin("agy", { envVarName: "AGY_BIN" }), runCli = execFileCli } = {}) {
  if (!bin) return [];
  let previous = [];
  try {
    if ((await fs.stat(cacheFile)).size < 256 * 1024) {
      const stored = JSON.parse(await fs.readFile(cacheFile, "utf8"));
      previous = parseAgyCatalog((stored.models || []).map((model) => `${model.slug}\t${model.name}`).join("\n"));
      const age = Date.now() - stored.checkedAt;
      if (previous.length && age >= 0 && age < 5 * 60_000) return previous;
    }
  } catch { /* Discovery is still available without a cache. */ }
  const models = await new Promise((resolve) => {
    runCli(bin, ["models"], { timeout: 15000, maxBuffer: 256 * 1024, env: withSystemProxy({ ...process.env, PATH: buildSpawnPath(), NO_COLOR: "1" }), windowsHide: true }, (error, stdout) => {
      resolve(error ? [] : parseAgyCatalog(stdout));
    });
  });
  if (!models.length) return previous;
  try {
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    const temp = `${cacheFile}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify({ checkedAt: Date.now(), models }), { mode: 0o600 });
    await fs.rename(temp, cacheFile);
  } catch { /* A read-only cache must not hide a successfully discovered model. */ }
  return models;
}

let pending;
let cached;
let checkedAt = 0;
async function getModelCatalog() {
  if (pending) return pending;
  if (cached && Date.now() - checkedAt < 60_000) return cached;
  pending = Promise.all([readCodexCatalog(), readGrokCatalog(), readAgyCatalog()]).then(([codex, grok, agy]) => {
    cached = { codex, grok, agy };
    checkedAt = Date.now();
    return cached;
  }).finally(() => { pending = null; });
  return pending;
}
module.exports = { getModelCatalog, readGrokCatalog, parseGrokCatalog, readCodexCatalog, readAgyCatalog, parseAgyCatalog };
