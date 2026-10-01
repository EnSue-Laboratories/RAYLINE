import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowRight, GitBranch, GitFork, Link2, Paperclip } from "lucide-react";
import type { Attachment } from "@shared/chat/types";
import type { GhIssue } from "@shared/github/types";
import type { EffortLevel, ModelDefinition } from "@shared/models";
import type { ProjectMeta } from "@shared/state/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import { useTranslator } from "../../contexts/LocaleContext";
import { createTranslator } from "../../i18n";
import { clearDraft, readDraft, writeDraft } from "../../utils/composerDrafts";
import ComposerChips from "./ComposerChips";
import { BranchSearchDropdown, IssueSearchDropdown, WorktreeInputDropdown } from "./Dropdowns";
import { ModelPickerWithMultica, ProjectPicker, clipboardItemsToAttachments, fileListToAttachments } from "./boundaries";
import {
  filterBranches,
  filterIssues,
  issueChipLabel,
  issueContextFor,
  newChatDraftScope,
  parseNewChatDraft,
  preferredBranch,
  resolveCreateRequest,
  type BranchMode,
  type NewChatRequest,
} from "./newChat";
import { cardStyle, chipIconStyle, chipLabelStyle, inputBase, isPlainEnter, toolBtnStyle } from "./styles";
import BackButton from "./BackButton";
import { useFileDrop } from "./useFileDrop";
import { useBranches, useRepoIssues } from "./useRepoData";
import { useCardMenus } from "./useCardMenus";

export interface NewChatCardProps {
  onCreateChat: (request: NewChatRequest) => Promise<unknown> | void;
  defaultCwd?: string | null;
  defaultModel?: string;
  defaultBranch?: string | null;
  allCwdRoots?: readonly string[];
  projects?: Readonly<Record<string, ProjectMeta>>;
  onPickFolder?: () => Promise<string | null | undefined>;
  onCancel?: () => void;
  developerMode?: boolean;
  extraModels?: readonly ModelDefinition[];
  /** Reasoning effort for the picked model (null = model default). */
  effort?: EffortLevel | null;
  onEffortChange?: (effort: EffortLevel | null) => void;
  /** Overrides the LocaleContext locale. */
  locale?: string;
}

const NO_MODELS: readonly ModelDefinition[] = [];

export default function NewChatCard({
  onCreateChat,
  defaultCwd,
  defaultModel,
  defaultBranch,
  allCwdRoots,
  projects,
  onPickFolder,
  onCancel,
  developerMode = true,
  extraModels = NO_MODELS,
  effort,
  onEffortChange,
  locale,
}: NewChatCardProps) {
  const s = useFontScale();
  const contextT = useTranslator();
  const t = locale ? createTranslator(locale) : contextT;
  const draftScope = newChatDraftScope(defaultCwd);
  const [savedDraft] = useState(() => parseNewChatDraft(readDraft(draftScope)));
  const submittedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [prompt, setPrompt] = useState(savedDraft.prompt ?? "");
  const [model, setModel] = useState(savedDraft.model || defaultModel || "sonnet");
  const [selectedCwd, setSelectedCwd] = useState<string | null>("cwd" in savedDraft ? savedDraft.cwd ?? null : defaultCwd ?? null);
  const [branch, setBranch] = useState(savedDraft.branch ?? "");
  const [branchMode, setBranchMode] = useState<BranchMode | null>(savedDraft.branchMode ?? null);
  const [worktree, setWorktree] = useState(savedDraft.worktree ?? false);
  const [worktreeName, setWorktreeName] = useState(savedDraft.worktreeName ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(savedDraft.attachments ?? []);
  const [issueContext, setIssueContext] = useState<string | null>(savedDraft.issueContext ?? null);
  const [error, setError] = useState<string | null>(null);
  const [creatingChat, setCreatingChat] = useState(false);

  const [issueSearchQuery, setIssueSearchQuery] = useState("");
  const [branchSearchQuery, setBranchSearchQuery] = useState("");
  const menus = useCardMenus({
    onCancel,
    blocked: creatingChat,
    scopeRef: textareaRef,
    onBranchDismissed: () => setBranchSearchQuery(""),
  });
  const { issue: issueMenu, branch: branchMenu, tree: treeMenu } = menus;
  const { setOpen: setShowIssueSearch } = issueMenu;
  const { setOpen: setShowBranchSearch } = branchMenu;
  const { setOpen: setShowTreeInput } = treeMenu;
  const isDraftSelection = selectedCwd == null;

  // Preselect the default / current branch once branches load (unless set).
  const handleBranchesLoaded = (current: string, branches: readonly string[]) => {
    const preferred = preferredBranch(defaultBranch, current, branches);
    setBranch((prev) => prev || preferred);
    setBranchMode((prev) => prev || (preferred ? "existing" : null));
  };
  const { current: currentBranch, branches: branchList, loading: branchLoading } = useBranches(selectedCwd, handleBranchesLoaded);
  const { issues: issueList, loading: issueLoading } = useRepoIssues(selectedCwd, issueMenu.open);

  // Persist the form as a draft (until it is submitted).
  useEffect(() => {
    if (submittedRef.current) return;
    writeDraft(draftScope, { prompt, model, cwd: selectedCwd, branch, branchMode, worktree, worktreeName, issueContext, attachments });
  }, [draftScope, prompt, model, selectedCwd, branch, branchMode, worktree, worktreeName, issueContext, attachments]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const addAttachments = useCallback((next: readonly Attachment[]) => {
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  }, []);
  const drop = useFileDrop((files) => { void fileListToAttachments(files).then(addAttachments); });

  const handleCreate = async () => {
    if (creatingChat) return;
    const resolution = resolveCreateRequest({
      prompt, model, cwd: selectedCwd, branch, branchMode, worktree, worktreeName, currentBranch, issueContext, attachments,
    });
    if (resolution.kind === "empty") return;
    if (resolution.kind === "error") {
      setError(t(resolution.key));
      return;
    }
    setError(null);
    setCreatingChat(true);
    try {
      await onCreateChat(resolution.request);
      submittedRef.current = true;
      clearDraft(draftScope);
    } catch (createError) {
      setError(createError instanceof Error && createError.message ? createError.message : t("newChat.failedToCreateChat"));
    } finally {
      setCreatingChat(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isPlainEnter(e) && !e.shiftKey) {
      e.preventDefault();
      void handleCreate();
    }
  };

  const handleAttach = async () => {
    const files = await window.api?.selectFiles?.();
    if (files?.length) addAttachments(files.map((f) => ({ type: "file", name: f.split("/").pop(), path: f })));
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    if (!items.some((item) => item.kind === "file")) return;
    e.preventDefault();
    void clipboardItemsToAttachments(items).then(addAttachments);
  };

  const handleProjectChange = useCallback((nextCwd: string | null) => {
    setSelectedCwd(nextCwd);
    setBranch("");
    setBranchMode(null);
    setBranchSearchQuery("");
    setShowBranchSearch(false);
    setWorktree(false);
    setWorktreeName("");
    setShowTreeInput(false);
    // Issues belong to the previous repo.
    setIssueContext(null);
    setShowIssueSearch(false);
    setIssueSearchQuery("");
    setError(null);
  }, [setShowBranchSearch, setShowIssueSearch, setShowTreeInput]);

  const handleBrowseProject = async () => {
    const folder = await onPickFolder?.();
    if (folder) handleProjectChange(folder);
  };

  const openBranchPicker = () => {
    if (!selectedCwd) {
      setError(t("newChat.selectProjectBeforeBranch"));
      return;
    }
    setError(null);
    setBranchSearchQuery("");
    branchMenu.toggleExclusive();
  };

  const selectExistingBranch = (name: string) => {
    setBranch(name);
    setBranchMode("existing");
    setBranchSearchQuery("");
    setShowBranchSearch(false);
    setError(null);
  };

  const applyCustomBranch = (value: string) => {
    const nextBranch = value.trim();
    if (!nextBranch) return;
    setBranch(nextBranch);
    setBranchMode(worktree ? "existing" : "new");
    setBranchSearchQuery("");
    setShowBranchSearch(false);
    setError(null);
  };

  const openTreeInput = () => {
    if (!selectedCwd) {
      setError(t("newChat.selectProjectBeforeWorktree"));
      return;
    }
    setError(null);
    setShowTreeInput((prev) => !prev);
  };

  const confirmTreeName = (value: string) => {
    setWorktreeName(value.trim());
    setWorktree(true);
    // A worktree's base must be an existing branch; if the user had typed a
    // new branch in the branch picker, fall back to the current branch.
    if (branchMode === "new") {
      setBranch(currentBranch || "");
      setBranchMode(currentBranch ? "existing" : null);
    }
    setShowTreeInput(false);
    setError(null);
  };

  const disableWorktree = () => {
    setWorktree(false);
    setWorktreeName("");
    setShowTreeInput(false);
  };

  const selectIssue = (issue: GhIssue) => {
    setIssueContext(issueContextFor(issue));
    setShowIssueSearch(false);
    setIssueSearchQuery("");
  };

  const branchLabel = branch || currentBranch || (worktree ? t("newChat.base") : t("newChat.branch"));
  const treeLabel = worktreeName || t("newChat.tree");
  const issueLabel = issueChipLabel(issueContext) ?? t("newChat.issue");
  const canCreate = !creatingChat && Boolean(prompt.trim());

  return (
    <div
      style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", flex: 1, padding: 24, minHeight: 0, gap: 12 }}
      {...drop.handlers}
    >
      <div style={cardStyle(drop.dragOver)}>
        <textarea
          ref={textareaRef}
          placeholder={t("newChat.promptPlaceholder")}
          disabled={creatingChat}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            // Auto-grow
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={4}
          style={{ ...inputBase, fontSize: s(13), lineHeight: 1.6, resize: "none", minHeight: 100, maxHeight: 300, overflowY: "auto", padding: "8px 0" }}
        />

        <ComposerChips
          issueContext={issueContext}
          attachments={attachments}
          onClearIssue={() => setIssueContext(null)}
          onRemoveAttachment={(idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <ModelPickerWithMultica value={model} onChange={setModel} extraModels={extraModels} effort={effort} onEffortChange={onEffortChange} />

          <button
            onClick={() => { void handleAttach(); }}
            style={toolBtnStyle(false, s)}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--control-bg-active)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--control-bg)"; }}
          >
            <Paperclip style={chipIconStyle} />
            {t("newChat.file")}
          </button>

          {developerMode && !isDraftSelection && (
            <div ref={branchMenu.anchorRef} style={{ position: "relative" }}>
              <button onClick={openBranchPicker} style={toolBtnStyle(Boolean(branch), s)}>
                <GitBranch style={chipIconStyle} />
                <span style={chipLabelStyle}>{branchLabel}</span>
              </button>
              {branchMenu.open && (
                <BranchSearchDropdown
                  ref={branchMenu.menuRef}
                  anchorRef={branchMenu.anchorRef}
                  s={s}
                  t={t}
                  onClose={() => setShowBranchSearch(false)}
                  query={branchSearchQuery}
                  onQueryChange={setBranchSearchQuery}
                  branches={filterBranches(branchList, branchSearchQuery)}
                  loading={branchLoading}
                  currentBranch={currentBranch}
                  worktree={worktree}
                  onSelectBranch={selectExistingBranch}
                  onUseCustomBranch={applyCustomBranch}
                />
              )}
            </div>
          )}

          {developerMode && !isDraftSelection && (
            <div ref={treeMenu.anchorRef} style={{ position: "relative" }}>
              <button onClick={openTreeInput} style={toolBtnStyle(worktree, s)}>
                <GitFork style={chipIconStyle} />
                <span style={chipLabelStyle}>{treeLabel}</span>
              </button>
              {treeMenu.open && (
                <WorktreeInputDropdown
                  ref={treeMenu.menuRef}
                  anchorRef={treeMenu.anchorRef}
                  s={s}
                  t={t}
                  onClose={() => setShowTreeInput(false)}
                  initialValue={worktreeName}
                  active={worktree}
                  baseBranch={branch || currentBranch}
                  onConfirm={confirmTreeName}
                  onDisable={disableWorktree}
                />
              )}
            </div>
          )}

          {developerMode && !isDraftSelection && (
            <div ref={issueMenu.anchorRef} style={{ position: "relative" }}>
              <button
                onClick={() => {
                  if (issueContext) { setIssueContext(null); return; }
                  issueMenu.toggleExclusive();
                }}
                style={toolBtnStyle(Boolean(issueContext), s)}
              >
                <Link2 style={chipIconStyle} />
                {issueLabel}
              </button>
              {issueMenu.open && (
                <IssueSearchDropdown
                  ref={issueMenu.menuRef}
                  anchorRef={issueMenu.anchorRef}
                  s={s}
                  t={t}
                  onClose={() => setShowIssueSearch(false)}
                  query={issueSearchQuery}
                  onQueryChange={setIssueSearchQuery}
                  issues={filterIssues(issueList, issueSearchQuery)}
                  loading={issueLoading}
                  onSelect={selectIssue}
                />
              )}
            </div>
          )}
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
          paddingTop: 10, borderTop: "1px solid var(--pane-border)",
        }}>
          <ProjectPicker
            value={selectedCwd}
            onChange={handleProjectChange}
            allCwdRoots={allCwdRoots}
            projects={projects}
            onBrowse={() => { void handleBrowseProject(); }}
          />
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => { void handleCreate(); }}
            aria-label={t("newChat.create")}
            style={{ ...toolBtnStyle(true, s), marginLeft: "auto", opacity: canCreate ? 1 : 0.5 }}
          >
            {creatingChat ? t("newChat.creating") : t("newChat.create")}
            <ArrowRight size={13} />
          </button>
        </div>

        {error && (
          <div style={{ fontSize: s(10), color: "var(--danger-text)", fontFamily: "var(--font-mono)" }}>{error}</div>
        )}
      </div>
      {onCancel && (
        <BackButton onClick={onCancel} disabled={creatingChat} label={t("newChat.back")} hint={t("newChat.cancelHint")} s={s} />
      )}
    </div>
  );
}
