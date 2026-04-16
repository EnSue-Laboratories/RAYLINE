import { useState, useRef, useEffect, useCallback } from "react";
import { Paperclip, Link, GitFork, X } from "lucide-react";
import ModelPicker from "./ModelPicker";
import ProjectPicker from "./ProjectPicker";
import { useFontScale } from "../contexts/FontSizeContext";

export default function NewChatCard({
  onCreateChat,
  defaultCwd,
  defaultModel,
  allCwdRoots,
  projects,
  onPickFolder,
  onCancel,
}) {
  const s = useFontScale();
  const textareaRef = useRef(null);

  const [title, setTitle] = useState("");
  const [branch, setBranch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(defaultModel || "sonnet");
  const [selectedCwd, setSelectedCwd] = useState(defaultCwd);
  const [worktree, setWorktree] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [issueContext, setIssueContext] = useState(null);

  // Issue linking UI state
  const [showIssueInput, setShowIssueInput] = useState(false);
  const [issueInputValue, setIssueInputValue] = useState("");
  const [issueLoading, setIssueLoading] = useState(false);

  // Auto-focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Escape key handler
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  // Auto-grow textarea
  const autoGrow = useCallback((el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  const handleCreate = useCallback(() => {
    if (!prompt.trim()) return;
    let finalPrompt = prompt;
    if (issueContext) finalPrompt = issueContext + "\n\n" + prompt;
    onCreateChat({
      cwd: selectedCwd,
      title: title.trim() || undefined,
      prompt: finalPrompt,
      model,
      branch: branch.trim() || undefined,
      worktree,
      issueContext: issueContext || undefined,
      attachments: attachments.length ? attachments : undefined,
    });
  }, [prompt, issueContext, onCreateChat, selectedCwd, title, model, branch, worktree, attachments]);

  // Cmd/Ctrl+Enter to create
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleCreate();
      }
    },
    [handleCreate]
  );

  const handleAttach = useCallback(async () => {
    const files = await window.api?.selectFiles?.();
    if (files?.length) setAttachments((prev) => [...prev, ...files]);
  }, []);

  const removeAttachment = useCallback((idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleIssueFetch = useCallback(async (raw) => {
    const val = raw.trim();
    if (!val) { setShowIssueInput(false); return; }

    // Parse "owner/repo#number" or "#number" or just "number"
    let repo = null;
    let number = null;
    const full = val.match(/^([^#]+)#(\d+)$/);
    const short = val.match(/^#?(\d+)$/);
    if (full) {
      repo = full[1];
      number = parseInt(full[2], 10);
    } else if (short) {
      number = parseInt(short[1], 10);
    }
    if (!number) { setShowIssueInput(false); return; }

    setIssueLoading(true);
    try {
      const issue = await window.api?.ghGetIssue?.(repo, number);
      if (issue) {
        setIssueContext(`Issue #${issue.number || number}: ${issue.title}\n\n${issue.body || ""}`);
        setIssueInputValue("");
        setShowIssueInput(false);
      }
    } catch {
      // silently fail
    } finally {
      setIssueLoading(false);
    }
  }, []);

  const isMac = navigator.platform?.includes("Mac");
  const modKey = isMac ? "\u2318" : "Ctrl";

  const cardStyle = {
    maxWidth: 600,
    width: "100%",
    background: "rgba(8,8,12,0.55)",
    backdropFilter: "blur(48px) saturate(1.2)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const inputBase = {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "rgba(255,255,255,0.85)",
    fontFamily: "system-ui, sans-serif",
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flex: 1,
        padding: 24,
      }}
      onKeyDown={handleKeyDown}
    >
      <div style={cardStyle}>
        {/* Top row: title + branch */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Workspace name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              ...inputBase,
              flex: 1,
              fontSize: s(13),
              padding: "6px 0",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          />
          <input
            type="text"
            placeholder="branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            style={{
              ...inputBase,
              width: 140,
              fontSize: s(11),
              fontFamily: "'JetBrains Mono', monospace",
              padding: "6px 8px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.5)",
              textAlign: "right",
            }}
          />
        </div>

        {/* Main textarea */}
        <textarea
          ref={textareaRef}
          placeholder="What do you want to do?"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            autoGrow(e.target);
          }}
          rows={4}
          style={{
            ...inputBase,
            fontSize: s(13),
            lineHeight: 1.6,
            resize: "none",
            minHeight: 100,
            maxHeight: 300,
            overflowY: "auto",
            padding: "8px 0",
          }}
        />

        {/* Chips area: issue + attachments */}
        {(issueContext || attachments.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {issueContext && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  background: "rgba(140,180,255,0.1)",
                  border: "1px solid rgba(140,180,255,0.15)",
                  borderRadius: 6,
                  fontSize: s(10),
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "rgba(180,210,255,0.8)",
                }}
              >
                {issueContext.split("\n")[0]}
                <button
                  onClick={() => setIssueContext(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.3)",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {attachments.map((f, i) => (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 8px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 6,
                  fontSize: s(10),
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                {f.split("/").pop()}
                <button
                  onClick={() => removeAttachment(i)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.3)",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Toolbar row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ModelPicker value={model} onChange={setModel} />

          <button
            onClick={handleAttach}
            title="Attach files"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 6,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.04)",
              borderRadius: 7,
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              transition: "all .2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)";
            }}
          >
            <Paperclip size={13} strokeWidth={2} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => {
                if (issueContext) {
                  setIssueContext(null);
                } else {
                  setShowIssueInput((v) => !v);
                }
              }}
              title="Link issue"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 6,
                background: issueContext
                  ? "rgba(140,180,255,0.1)"
                  : "rgba(255,255,255,0.02)",
                border: `1px solid ${issueContext ? "rgba(140,180,255,0.15)" : "rgba(255,255,255,0.04)"}`,
                borderRadius: 7,
                color: issueContext
                  ? "rgba(180,210,255,0.8)"
                  : "rgba(255,255,255,0.4)",
                cursor: "pointer",
                transition: "all .2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = issueContext
                  ? "rgba(140,180,255,0.15)"
                  : "rgba(255,255,255,0.04)";
              }}
            >
              <Link size={13} strokeWidth={2} />
            </button>

            {showIssueInput && (
              <input
                autoFocus
                type="text"
                placeholder="owner/repo#123"
                value={issueInputValue}
                onChange={(e) => setIssueInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleIssueFetch(issueInputValue);
                  }
                }}
                onBlur={() => handleIssueFetch(issueInputValue)}
                disabled={issueLoading}
                style={{
                  ...inputBase,
                  fontSize: s(10),
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: "4px 8px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  width: 150,
                  color: "rgba(255,255,255,0.6)",
                }}
              />
            )}
          </div>

          <button
            onClick={() => setWorktree((v) => !v)}
            title="Worktree mode"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 6,
              background: worktree
                ? "rgba(140,255,180,0.1)"
                : "rgba(255,255,255,0.02)",
              border: `1px solid ${worktree ? "rgba(140,255,180,0.15)" : "rgba(255,255,255,0.04)"}`,
              borderRadius: 7,
              color: worktree
                ? "rgba(140,255,180,0.8)"
                : "rgba(255,255,255,0.4)",
              cursor: "pointer",
              transition: "all .2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = worktree
                ? "rgba(140,255,180,0.15)"
                : "rgba(255,255,255,0.04)";
            }}
          >
            <GitFork size={13} strokeWidth={2} />
          </button>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 4,
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <ProjectPicker
            value={selectedCwd}
            onChange={setSelectedCwd}
            allCwdRoots={allCwdRoots}
            projects={projects}
            onBrowse={onPickFolder}
          />
          <span
            style={{
              fontSize: s(10),
              color: "rgba(255,255,255,0.2)",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: ".04em",
            }}
          >
            {modKey}+Enter to create
          </span>
        </div>
      </div>
    </div>
  );
}
