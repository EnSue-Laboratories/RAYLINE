import { MenuSelect } from "../components/ui/MenuSelect";
import { useEffect, useState, type CSSProperties } from "react";
import { ExternalLink, X } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import { useTranslator } from "../contexts/LocaleContext";
import { createItem, type CreatedItem } from "../pm/create/createItem";
import PastedImagesNotice from "../pm/create/PastedImagesNotice";
import { useBranchOptions } from "../pm/create/useBranchOptions";
import { usePastedImages } from "../pm/create/usePastedImages";
import { buildGithubNewItemUrl, errorMessage } from "../pm/format";
import { formInputStyle, modalBackdropStyle, modalPanelStyle } from "../pm/styles";
import type { PmItemType } from "../pm/types";

export type { CreatedItem };

interface CreateFormProps {
  repos: string[];
  type: PmItemType;
  onClose: () => void;
  onCreated: (created: CreatedItem) => void;
}

const labelStyle: CSSProperties = { fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: ".04em" };

/** New issue / PR modal. */
export default function CreateForm({ repos, type, onClose, onCreated }: CreateFormProps) {
  const t = useTranslator();
  const [repo, setRepo] = useState(repos[0] || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { branches, head, setHead, base, setBase } = useBranchOptions(repo, type);
  const { images, handlePaste, removeImage, clearImages } = usePastedImages();
  const branchNames = branches.map((branch) => branch.name);
  const hasImages = images.length > 0;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSubmit = Boolean(title.trim()) && (type !== "pr" || Boolean(head && base));

  const handleSubmit = async () => {
    if (!canSubmit || submitting || hasImages) return;
    setSubmitting(true);
    setError(null);
    try {
      onCreated(await createItem({ type, repo, title, body, head, base }));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const handleContinueInGitHub = () => {
    if (!canSubmit) return;
    window.open(buildGithubNewItemUrl({ type, repo, title, body, head, base }), "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div style={modalBackdropStyle}>
      <div style={{ ...modalPanelStyle, width: 440, boxShadow: "var(--shadow-md)", padding: "20px", fontFamily: "var(--font-ui)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, color: "var(--text-primary)", fontWeight: 600 }}>
            {type === "pr" ? t("pm.newPullRequest") : t("pm.newIssue")}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{t("pm.repo")}</label>
          <MenuSelect
            value={repo}
            options={repos.map((r) => ({ value: r, label: r }))}
            ariaLabel={t("pm.repo")}
            onChange={setRepo}
            menuZIndex={1100}
            triggerStyle={{ width: "100%" }}
          />
        </div>

        {type === "pr" && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{t("pm.head")}</label>
              <SearchableSelect options={branchNames} value={head} onChange={setHead} placeholder={t("pm.searchBranches")} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{t("pm.base")}</label>
              <SearchableSelect options={branchNames} value={base} onChange={setBase} placeholder={t("pm.searchBranches")} />
            </div>
          </div>
        )}

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>{t("pm.title")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "pr" ? t("pm.prTitlePlaceholder") : t("pm.issueTitlePlaceholder")}
            style={{ ...formInputStyle, marginTop: 4 }}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t("pm.description")}</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("pm.optionalDescription")}
            rows={4}
            style={{ ...formInputStyle, marginTop: 4, resize: "vertical", minHeight: 60 }}
            onPaste={handlePaste}
          />
        </div>

        {hasImages && <PastedImagesNotice images={images} onRemove={removeImage} onClear={clearImages} />}

        {error && <div style={{ fontSize: 12, color: "var(--danger-text)", marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--pane-border)",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: ".04em",
            }}
          >
            {t("pm.cancel")}
          </button>
          <button
            onClick={hasImages ? handleContinueInGitHub : () => void handleSubmit()}
            disabled={!canSubmit || submitting}
            style={{
              background: canSubmit ? "var(--pane-active)" : "var(--pane-hover)",
              border: "1px solid var(--control-border)",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: canSubmit ? "pointer" : "default",
              color: canSubmit ? "var(--text-primary)" : "var(--text-disabled)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              letterSpacing: ".04em",
              transition: "all .15s",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {submitting
              ? t("pm.creating")
              : hasImages
                ? <>{t("pm.continueInGithub")}<ExternalLink size={13} strokeWidth={1.75} /></>
                : t("pm.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
