/** "", "42s", "3m", "3m 5s" — empty below one second. */
export function formatThinkingDuration(seconds: number): string {
  if (seconds < 1) return "";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

/**
 * Seconds to show: the live ticker while thinking, otherwise the reported
 * duration (OpenCode) when there is one, else whatever the ticker reached.
 */
export function resolveThinkingSeconds(isThinking: boolean, elapsedSeconds: number, durationMs: number | undefined): number {
  if (isThinking) return elapsedSeconds;
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
    return Math.max(0, Math.round(durationMs / 1000));
  }
  return elapsedSeconds;
}

export function thinkingSummary(isThinking: boolean, duration: string): string {
  if (isThinking) return duration ? `Thinking for ${duration}...` : "Thinking...";
  return `Thought for ${duration || "a moment"}`;
}
