// Delta streams may split a word across events. Only adjacent parts of the
// same kind can be joined; a tool or reasoning boundary is significant.
export function appendAdjacentTextPart(parts = [], type, text) {
  if (!text) return parts;
  const next = [...parts];
  const last = next.at(-1);
  if (last?.type === type && typeof last.text === "string") {
    next[next.length - 1] = { ...last, text: last.text + text };
  } else next.push({ type, text });
  return next;
}
