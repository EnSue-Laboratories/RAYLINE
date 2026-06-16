export const DEFAULT_NETWORK_PROXY = {
  enabled: false,
  url: "",
  noProxy: "localhost,127.0.0.1,::1",
};

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNetworkProxy(input) {
  if (typeof input === "string") {
    const url = safeString(input);
    return {
      ...DEFAULT_NETWORK_PROXY,
      enabled: Boolean(url),
      url,
    };
  }

  if (!input || typeof input !== "object") {
    return { ...DEFAULT_NETWORK_PROXY };
  }

  return {
    enabled: Boolean(input.enabled),
    url: safeString(input.url || input.proxyUrl),
    noProxy: safeString(input.noProxy || input.no_proxy) || DEFAULT_NETWORK_PROXY.noProxy,
  };
}

export function normalizeProxyRuntimeUrl(value) {
  let raw = safeString(value);
  if (!raw) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    raw = `http://${raw}`;
  }

  try {
    const url = new URL(raw);
    url.protocol = url.protocol.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

export function hasActiveNetworkProxy(config) {
  const normalized = normalizeNetworkProxy(config);
  return Boolean(normalized.enabled && normalizeProxyRuntimeUrl(normalized.url));
}
