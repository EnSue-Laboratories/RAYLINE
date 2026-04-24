import { useState, useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import { createTranslator } from "../i18n";

const inputStyle = {
  width: "100%",
  background: "var(--pane-hover)",
  border: "1px solid var(--pane-border)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "var(--text-secondary)",
  fontSize: 13,
  fontFamily: "system-ui, sans-serif",
  boxSizing: "border-box",
};

const selectStyle = {
  ...inputStyle,
  marginTop: 4,
  cursor: "pointer",
  WebkitAppearance: "none",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
  paddingRight: 30,
};

export default function CreateForm({ repos, type, onClose, onCreated, locale = "en-US" }) {
  const t = createTranslator(locale);
  const [repo, setRepo] = useState(repos[0] || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState("");
  const [base, setBase] = useState("main");
  const [branches, setBranches] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [images, setImages] = useState([]);

  useEffect(() => {
    if (type === "pr" && repo) {
      Promise.all([
        window.ghApi.listBranches(repo),
        window.ghApi.getCurrentBranch(),
        window.ghApi.getRepoDefaultBranch(repo),
      ]).then(([b, currentBranch, defaultBranch]) => {
        const branchNames = b.map((br) => br.name);
        setBranches(b);
        if (!head) {
          const match = branchNames.find((n) => n === currentBranch);
          setHead(match || branchNames[0] || "");
        }
        setBase(defaultBranch);
      }).catch(() => {});
    }
  }, [repo, type, head]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = Boolean(title.trim()) && (type !== "pr" || (head && base));

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (ev) => {
          setImages((prev) => [...prev, {
            name: file.name || `image-${Date.now()}.png`,
            dataUrl: ev.target.result,
          }]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting || images.length > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const finalBody = body.trim();
      let created;
      if (type === "issue") {
        const issue = await window.ghApi.createIssue(repo, title.trim(), finalBody);
        created = { ...issue, _repo: repo };
      } else {
        const res = await window.ghApi.createPR(repo, title.trim(), finalBody, head, base);
        const match = (res?.url || "").match(/\/pull\/(\d+)/);
        const number = match ? parseInt(match[1], 10) : null;
        created = {
          number,
          title: title.trim(),
          state: "open",
          draft: false,
          merged_at: null,
          updated_at: new Date().toISOString(),
          user: { login: "" },
          _repo: repo,
        };
      }
      onCreated(created);
      onClose();
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const handleContinueInGitHub = () => {
    if (!canSubmit) return;
    const finalBody = body.trim();
    const encodedTitle = encodeURIComponent(title.trim());
    const encodedBody = encodeURIComponent(finalBody);
    const url = type === "issue"
      ? `https://github.com/${repo}/issues/new?title=${encodedTitle}&body=${encodedBody}`
      : `https://github.com/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?expand=1&title=${encodedTitle}&body=${encodedBody}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "var(--pm-modal-backdrop)",
        backdropFilter: "blur(var(--pm-modal-backdrop-blur))",
        WebkitBackdropFilter: "blur(var(--pm-modal-backdrop-blur))",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 440, background: "var(--pane-elevated)",
          backdropFilter: "blur(48px) saturate(1.2)",
          WebkitBackdropFilter: "blur(48px) saturate(1.2)",
          boxShadow: "var(--modal-shadow)",
          border: "1px solid var(--pane-border)", borderRadius: 12,
          padding: "20px", fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 600 }}>
            {type === "pr" ? t("pm.newPullRequest") : t("pm.newIssue")}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Repo selector */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>{t("pm.repo")}</label>
          <select
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            style={selectStyle}
          >
            {repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Branch selectors for PR */}
        {type === "pr" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>{t("pm.head")}</label>
              <SearchableSelect
                options={branches.map((b) => b.name)}
                value={head}
                onChange={setHead}
                placeholder={t("pm.searchBranches")}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>{t("pm.base")}</label>
              <SearchableSelect
                options={branches.map((b) => b.name)}
                value={base}
                onChange={setBase}
                placeholder={t("pm.searchBranches")}
              />
            </div>
          </div>
        )}

        {/* Title */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>{t("pm.title")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "pr" ? t("pm.prTitlePlaceholder") : t("pm.issueTitlePlaceholder")}
            style={{ ...inputStyle, marginTop: 4 }}
            autoFocus
          />
        </div>

        {/* Body */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em" }}>{t("pm.description")}</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("pm.optionalDescription")}
            rows={4}
            style={{ ...inputStyle, marginTop: 4, resize: "vertical", minHeight: 60 }}
            onPaste={handlePaste}
          />
        </div>

        {images.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={img.dataUrl} alt={img.name} style={{ height: 48, maxWidth: 80, borderRadius: 4, border: "1px solid var(--control-border)" }} />
                  <button
                    onClick={() => {
                      setImages((prev) => prev.filter((_, j) => j !== i));
                    }}
                    style={{
                      position: "absolute", top: -4, right: -4, width: 16, height: 16,
                      borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "1px solid var(--control-border)",
                      color: "var(--icon-secondary)", fontSize: 10, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                    }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
            <div
              style={{
                borderRadius: 8,
                border: "1px solid var(--pane-border)",
                background: "var(--pane-hover)",
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 4 }}>
                {t("pm.imageUploadTitle")}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.45, marginBottom: 8 }}>
                {t("pm.imageUploadBody")}
              </div>
              <button
                onClick={() => setImages([])}
                style={{
                  background: "var(--pane-active)",
                  border: "1px solid var(--control-border)",
                  borderRadius: 6,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: ".04em",
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                {t("pm.createWithoutImages")}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: "var(--danger-soft-text)", marginBottom: 10 }}>{error}</div>
        )}

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{
            background: "none", border: "1px solid var(--pane-border)",
            borderRadius: 6, padding: "6px 14px", cursor: "pointer",
            color: "var(--text-muted)", fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em",
          }}>
            {t("pm.cancel")}
          </button>
          <button
            onClick={images.length > 0 ? handleContinueInGitHub : handleSubmit}
            disabled={!canSubmit || submitting}
            style={{
              background: canSubmit ? "var(--pane-active)" : "var(--pane-hover)",
              border: "1px solid var(--control-border)", borderRadius: 6,
              padding: "6px 14px", cursor: canSubmit ? "pointer" : "default",
              color: canSubmit ? "var(--text-secondary)" : "var(--text-faint)",
              fontSize: 12, fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".04em",
              transition: "all .15s",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {submitting
              ? t("pm.creating")
              : images.length > 0
                ? (
                  <>
                    {t("pm.continueInGithub")}
                    <ExternalLink size={13} strokeWidth={1.75} />
                  </>
                )
                : t("pm.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
