const { app, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");

const STORE_FILENAME = "byok-keys.enc";

function log(...args) {
  console.log("[byok-store]", ...args);
}

function getStorePath() {
  return path.join(app.getPath("userData"), STORE_FILENAME);
}

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function writeStore(providers) {
  const json = JSON.stringify(providers);
  const storePath = getStorePath();

  if (isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(storePath, encrypted);
  } else {
    log("WARNING: safeStorage encryption not available — storing keys with base64 encoding only");
    fs.writeFileSync(storePath, Buffer.from(json).toString("base64"), "utf-8");
  }
}

function readStore() {
  const storePath = getStorePath();
  if (!fs.existsSync(storePath)) return [];

  try {
    const raw = fs.readFileSync(storePath);

    if (isEncryptionAvailable()) {
      const json = safeStorage.decryptString(raw);
      return JSON.parse(json);
    }

    // Fallback: base64
    const json = Buffer.from(raw.toString("utf-8"), "base64").toString("utf-8");
    return JSON.parse(json);
  } catch (err) {
    log("Failed to read store:", err.message);
    return [];
  }
}

function maskApiKey(key) {
  if (!key || typeof key !== "string") return "";
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}

function validateProvider(p) {
  if (!p || typeof p !== "object") return null;
  const id = String(p.id || "").trim();
  const name = String(p.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    apiKey: String(p.apiKey || ""),
    baseUrl: String(p.baseUrl || "").trim(),
    defaultModelId: String(p.defaultModelId || "").trim(),
  };
}

// --- Public API ---

function saveByokProviders(providers) {
  if (!Array.isArray(providers)) throw new Error("providers must be an array");
  const currentProviders = readStore();
  const validated = providers.map((p) => {
    const valid = validateProvider(p);
    if (!valid) return null;
    if (valid.apiKey.includes("••••")) {
      const existing = currentProviders.find((ep) => ep.id === valid.id);
      if (existing) {
        valid.apiKey = existing.apiKey;
      } else {
        valid.apiKey = "";
      }
    }
    return valid;
  }).filter(Boolean);
  writeStore(validated);
  log("Saved", validated.length, "provider(s)");
  return true;
}

function loadByokProviders() {
  return readStore();
}

function getMaskedProviders() {
  const providers = readStore();
  return providers.map((p) => ({
    ...p,
    apiKey: maskApiKey(p.apiKey),
  }));
}

function getByokKeyForProvider(providerId) {
  const providers = readStore();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return null;
  return { apiKey: provider.apiKey, baseUrl: provider.baseUrl };
}

function deleteByokProvider(providerId) {
  const providers = readStore();
  const filtered = providers.filter((p) => p.id !== providerId);
  writeStore(filtered);
  log("Deleted provider:", providerId);
  return true;
}

function testByokKey(providerId) {
  const provider = readStore().find((p) => p.id === providerId);
  if (!provider) return { ok: false, error: "Provider not found" };
  if (!provider.apiKey && !provider.baseUrl) return { ok: false, error: "No API key or base URL configured" };
  // Basic validation only — actual connectivity test will be in the agent manager
  return { ok: true, encrypted: isEncryptionAvailable() };
}

module.exports = {
  saveByokProviders,
  loadByokProviders,
  getMaskedProviders,
  getByokKeyForProvider,
  deleteByokProvider,
  testByokKey,
};
