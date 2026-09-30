const path = require("node:path");
const { execFileSync } = require("node:child_process");

function terminalCliPath() {
  return __dirname.includes("app.asar")
    ? path.join(process.resourcesPath, "app.asar.unpacked", "scripts", "claudi-terminal.cjs")
    : path.join(__dirname, "../scripts/claudi-terminal.cjs");
}

function parseSystemProxy(text, env = {}) {
  const result = { ...env };
  for (const scheme of ["HTTP", "HTTPS"]) {
    if (env[`${scheme}_PROXY`] || env[`${scheme.toLowerCase()}_proxy`] || env.ALL_PROXY || env.all_proxy) continue;
    const enabled = new RegExp(`\\b${scheme}Enable\\s*:\\s*1\\b`).test(text);
    const host = new RegExp(`\\b${scheme}Proxy\\s*:\\s*(\\S+)`).exec(text)?.[1];
    const port = new RegExp(`\\b${scheme}Port\\s*:\\s*(\\d+)`).exec(text)?.[1];
    if (enabled && host && port && !/[\\/@?#]/.test(host)) result[`${scheme}_PROXY`] = `http://${host}:${port}`;
  }
  return result;
}

let cachedProxy = "";
let checkedAt = 0;
function withSystemProxy(env = process.env) {
  if (process.platform !== "darwin") return { ...env };
  if (Date.now() - checkedAt > 60_000) {
    try { cachedProxy = execFileSync("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] }); }
    catch { cachedProxy = ""; }
    checkedAt = Date.now();
  }
  return parseSystemProxy(cachedProxy, env);
}
module.exports = { terminalCliPath, parseSystemProxy, withSystemProxy };
