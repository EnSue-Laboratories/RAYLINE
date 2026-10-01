import { memo, useMemo } from "react";
import { useFontScale } from "../contexts/FontSizeContext";
import ValueControlCard, { type ValueControlCallbacks } from "./blocks/ValueControlCard";
import { normalizeControlBlock, type NormalizedControl } from "./blocks/valueControl";

export interface ValueControlBlockProps extends ValueControlCallbacks {
  /** Body of the ```control``` fence. */
  json: string;
  isStreaming?: boolean;
}

type ParseResult = { ok: true; value: NormalizedControl } | { ok: false; message: string };

function parseControl(json: string): ParseResult {
  try {
    return { ok: true, value: normalizeControlBlock(json) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function StreamingControlPlaceholder() {
  const s = useFontScale();
  return (
    <div
      style={{
        margin: "12px 0",
        borderRadius: 10,
        border: "1px solid var(--control-bg-strong)",
        background: "var(--control-bg-subtle)",
        padding: "18px 16px",
        color: "var(--text-muted)",
        fontSize: s(11),
        fontFamily: "var(--font-mono)",
        letterSpacing: ".08em",
      }}
    >
      CONTROL
    </div>
  );
}

function InvalidControl({ message }: { message: string }) {
  const s = useFontScale();
  return (
    <div
      style={{
        margin: "12px 0",
        borderRadius: 10,
        border: "1px solid var(--danger-border)",
        background: "var(--danger-bg)",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: s(10),
          fontFamily: "var(--font-mono)",
          color: "var(--danger-text)",
          letterSpacing: ".08em",
          marginBottom: 8,
        }}
      >
        INVALID CONTROL
      </div>
      <div style={{ fontSize: s(13), color: "var(--danger-text-strong)", fontFamily: "var(--font-ui)" }}>
        {message}
      </div>
    </div>
  );
}

function ValueControlBlock({ json, isStreaming = false, onAnswer, onControlChange, canControlTarget }: ValueControlBlockProps) {
  // Parse once per fence body (not on every parent render).
  const parsed = useMemo(() => (isStreaming ? null : parseControl(json)), [isStreaming, json]);

  if (!parsed) return <StreamingControlPlaceholder />;
  if (!parsed.ok) return <InvalidControl message={parsed.message} />;

  return (
    <ValueControlCard
      key={json}
      json={json}
      control={parsed.value.control}
      config={parsed.value.config}
      onAnswer={onAnswer}
      onControlChange={onControlChange}
      canControlTarget={canControlTarget}
    />
  );
}

export default memo(ValueControlBlock);
