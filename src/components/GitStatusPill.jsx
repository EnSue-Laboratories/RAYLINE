import { useState } from "react";
import { GitCommitHorizontal } from "lucide-react";
import { useFontScale } from "../contexts/FontSizeContext";
import useGitStatus from "../hooks/useGitStatus";

export default function GitStatusPill({ cwd }) {
  const s = useFontScale();
  const { status } = useGitStatus(cwd);
  // eslint-disable-next-line no-unused-vars
  const [open, setOpen] = useState(false);

  if (!status) return null;

  const dirty = status.files.length;
  const { ahead, behind, detached, upstream } = status;
  const clean = dirty === 0 && ahead === 0 && behind === 0;

  return (
    <button
      onClick={() => setOpen((v) => !v)}
      title={
        detached ? "Detached HEAD" :
        !upstream ? "No upstream configured" :
        clean ? "Clean & in sync" :
        `${dirty} changed · ${ahead} ahead · ${behind} behind`
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 23,
        padding: "0 8px",
        borderRadius: 7,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.6)",
        fontSize: s(11),
        fontFamily: "'JetBrains Mono',monospace",
        letterSpacing: ".04em",
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      <GitCommitHorizontal size={13} strokeWidth={1.6} />
      {detached ? (
        <span style={{ color: "rgba(200,160,100,0.8)" }}>detached</span>
      ) : !upstream ? (
        <span style={{ color: "rgba(255,255,255,0.4)" }}>local</span>
      ) : clean ? (
        <span style={{ color: "rgba(255,255,255,0.35)" }}>GIT</span>
      ) : (
        <>
          {dirty > 0 && <span style={{ color: "rgba(240,180,90,0.9)" }}>●{dirty}</span>}
          {ahead > 0 && <span style={{ color: "rgba(255,255,255,0.85)" }}>↑{ahead}</span>}
          {behind > 0 && <span style={{ color: "rgba(150,190,255,0.9)" }}>↓{behind}</span>}
        </>
      )}
    </button>
  );
}
