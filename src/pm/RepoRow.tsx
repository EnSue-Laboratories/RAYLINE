import { useState } from "react";
import type { GhRepoSummary } from "@shared/github/types";

interface RepoRowProps {
  repo: GhRepoSummary;
  added: boolean;
  onClick: () => void;
  addedLabel: string;
}

const ellipsis = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;

export default function RepoRow({ repo, added, onClick, addedLabel }: RepoRowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={added}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "10px 12px",
        borderRadius: 8,
        border: "none",
        cursor: added ? "default" : "pointer",
        background: hovered && !added ? "var(--pane-hover)" : "transparent",
        transition: "background .15s",
        textAlign: "left",
        opacity: added ? 0.4 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text-primary)", fontFamily: "var(--font-ui)", ...ellipsis }}>{repo.nameWithOwner}</div>
        {repo.description && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "var(--font-ui)", ...ellipsis }}>
            {repo.description}
          </div>
        )}
      </div>
      {added && (
        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            letterSpacing: ".06em",
            marginLeft: 8,
            flexShrink: 0,
          }}
        >
          {addedLabel || "ADDED"}
        </span>
      )}
    </button>
  );
}
