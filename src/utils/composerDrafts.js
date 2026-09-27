const PREFIX = "rayline.composerDraft:";
const cache = new Map();

export function readDraft(scope, storage) {
  if (!scope) return {};
  if (cache.has(scope)) return cache.get(scope);
  try {
    const target = storage ?? globalThis.localStorage;
    const value = target?.getItem(PREFIX + scope);
    if (!value) return {};
    let data;
    try {
      const parsed = JSON.parse(value);
      if (parsed?.version === 1 && parsed.data && typeof parsed.data === "object") data = parsed.data;
    } catch { /* Old versions stored plain text. */ }
    data ||= { text: value };
    const attachments = target?.getItem(PREFIX + scope + ":attachments");
    if (attachments) {
      try { const parsed = JSON.parse(attachments); if (Array.isArray(parsed)) data.attachments = parsed; } catch { /* Keep the text if attachment data is damaged. */ }
    }
    cache.set(scope, data);
    return data;
  } catch { return {}; }
}

export function writeDraft(scope, data, storage) {
  if (!scope) return;
  const previous = cache.get(scope);
  cache.set(scope, data);
  try {
    const target = storage ?? globalThis.localStorage;
    const key = PREFIX + scope;
    if (!Object.keys(data).length) {
      target?.removeItem(key);
      target?.removeItem(key + ":attachments");
      return;
    }
    // Images can be large. Persist them only when attachments change, never
    // serialize their binary payload on every keystroke.
    const { attachments, ...fields } = data;
    target?.setItem(key, JSON.stringify({ version: 1, data: fields }));
    if (attachments !== previous?.attachments) {
      if (attachments?.length) target?.setItem(key + ":attachments", JSON.stringify(attachments));
      else target?.removeItem(key + ":attachments");
    }
  } catch { /* Keep the current draft in memory if disk storage is unavailable/full. */ }
}

export function clearDraft(scope, storage) {
  writeDraft(scope, {}, storage);
}
