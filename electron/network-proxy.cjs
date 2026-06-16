const DEFAULT_NETWORK_PROXY = {
  enabled: false,
  url: "",
  noProxy: "localhost,127.0.0.1,::1",
};

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNetworkProxyConfig(input) {
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

function normalizeProxyRuntimeUrl(value) {
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

function buildProxyEnv(input) {
  const config = normalizeNetworkProxyConfig(input);
  const proxyUrl = config.enabled ? normalizeProxyRuntimeUrl(config.url) : "";
  if (!proxyUrl) return {};

  const env = {
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    ALL_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    all_proxy: proxyUrl,
    NODE_USE_ENV_PROXY: "1",
  };

  if (config.noProxy) {
    env.NO_PROXY = config.noProxy;
    env.no_proxy = config.noProxy;
  }

  return env;
}

function describeNetworkProxy(input) {
  const config = normalizeNetworkProxyConfig(input);
  const proxyUrl = config.enabled ? normalizeProxyRuntimeUrl(config.url) : "";
  return {
    enabled: Boolean(config.enabled),
    active: Boolean(proxyUrl),
    noProxy: config.noProxy,
  };
}

module.exports = {
  DEFAULT_NETWORK_PROXY,
  normalizeNetworkProxyConfig,
  normalizeProxyRuntimeUrl,
  buildProxyEnv,
  describeNetworkProxy,
};
