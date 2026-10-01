/**
 * Composer: permission prompts, queued messages, slash palette, attachment
 * preview, hints and the input box. Owns ALL keystroke-driven state and is
 * memoized on primitive / stable props, so typing never re-renders the
 * transcript and streaming never re-renders the textarea.
 */
import { type ChangeEvent, type KeyboardEvent, memo, type Ref, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowRight, Square, Terminal as TerminalIcon } from "lucide-react";
import type { AgentPermissionRequest, QueuedMessage } from "@shared/chat/types";
import { useFontScale } from "../../contexts/FontSizeContext";
import type { Translator } from "../../i18n";
import ImagePreview from "../ImagePreview";
import { clearComposerDraft, matchSlashCommands, readComposerDraft, writeComposerDraft } from "./composerDraft";
import PermissionRequests from "./PermissionRequests";
import QueuedMessages from "./QueuedMessages";
import SlashCommandPalette, { type SlashCommandOption } from "./SlashCommandPalette";
import type { PermissionResponseInput, SendHandler } from "./types";
import { type ComposerDropHandlers, useComposerAttachments } from "./useComposerAttachments";

/** Imperative API ChatArea uses for quoting and the whole-pane drop zone. */
export interface ComposerHandle extends ComposerDropHandlers {
  quote: (text: string) => void;
}

export interface ChatComposerProps {
  composerRef: Ref<ComposerHandle>;
  /** Draft persistence scope (the composer is keyed by it). */
  draftScope: string;
  onSend: SendHandler;
  onCancel: () => void;
  isStreaming: boolean;
  setupRequired: boolean;
  shellLocation: string;
  permissionRequests?: readonly AgentPermissionRequest[];
  onRespondPermission?: (response: PermissionResponseInput) => void;
  queuedMessages?: readonly QueuedMessage[];
  onUpdateQueuedMessage?: (queueId: string, text: string) => void;
  onRemoveQueuedMessage?: (queueId: string) => void;
  isMulticaModel: boolean;
  branchNeedsAttention: boolean;
  branchHintText: string;
  convoId: string | null;
  hasWallpaper: boolean;
  t: Translator;
}

const INPUT_MIN_HEIGHT = "20px";
const INPUT_MAX_HEIGHT = 120;

function resizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = INPUT_MIN_HEIGHT;
  el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT)}px`;
}

function ChatComposer(props: ChatComposerProps) {
  const { composerRef, draftScope, onSend, onCancel, isStreaming, setupRequired, shellLocation, isMulticaModel, branchNeedsAttention, branchHintText, convoId, hasWallpaper, t } = props;
  const s = useFontScale();
  const [input, setInput] = useState(() => readComposerDraft(draftScope).text);
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedCmd, setSelectedCmd] = useState(0);
  const [branchHintDismissedFor, setBranchHintDismissedFor] = useState<string | null>(null);
  const files = useComposerAttachments(() => readComposerDraft(draftScope).attachments);
  const { attachments, setAttachments, dragOver } = files;
  const inRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);

  // Persist the draft (text + attachments) per conversation / workspace (PR #230).
  useEffect(() => {
    writeComposerDraft(draftScope, input, attachments);
  }, [draftScope, input, attachments]);

  // A restored multi-line draft needs its height on mount.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => resizeTextarea(inRef.current));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const commands = useMemo<SlashCommandOption[]>(
    () => matchSlashCommands(input).map((cmd) => ({ cmd, desc: t(cmd === "/compact" ? "chatArea.cmdCompactDesc" : "chatArea.cmdClearDesc") })),
    [input, t],
  );

  const trimmedInput = input.trim();
  const shellMode = trimmedInput.startsWith("!");
  const canRunShell = shellMode && trimmedInput.length > 1;
  const canSend = shellMode ? canRunShell : !setupRequired && (Boolean(trimmedInput) || attachments.length > 0);
  const branchHintDismissed = Boolean(convoId && branchHintDismissedFor === convoId);
  const showBranchHint = isMulticaModel && branchNeedsAttention && !branchHintDismissed && !shellMode;

  const send = useCallback(() => {
    if (!canSend) return;
    const nextInput = trimmedInput;
    const nextAttachments = shellMode || attachments.length === 0 ? undefined : attachments;
    flushSync(() => {
      setInput("");
      setAttachments([]);
      setSelectedCmd(0);
    });
    clearComposerDraft(draftScope);
    if (inRef.current) inRef.current.style.height = INPUT_MIN_HEIGHT;
    if (isMulticaModel && !shellMode) setBranchHintDismissedFor(convoId);
    // A rejected send restores the draft unless something was typed meanwhile.
    Promise.resolve()
      .then(() => onSend(nextInput, nextAttachments))
      .catch(() => {
        const current = readComposerDraft(draftScope);
        if (current.text || current.attachments.length > 0) return;
        writeComposerDraft(draftScope, nextInput, nextAttachments ?? []);
        setInput(nextInput);
        setAttachments(nextAttachments ?? []);
      });
  }, [attachments, canSend, convoId, draftScope, isMulticaModel, onSend, setAttachments, shellMode, trimmedInput]);

  const handleInput = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(event.target.value);
    resizeTextarea(event.target);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // IME confirmation (Enter while composing CJK) must never send.
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (commands.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedCmd((index) => Math.min(index + 1, commands.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedCmd((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        setInput(`${commands[Math.min(selectedCmd, commands.length - 1)]?.cmd ?? ""} `);
        setSelectedCmd(0);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setInput("");
        setSelectedCmd(0);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  // ChatArea owns the full-pane drop zone and the selection toolbar; it drives
  // this component's OWN state through this handle instead of lifting it.
  useImperativeHandle(
    composerRef,
    () => ({
      quote(text: string) {
        const quoted = text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        setInput((prev) => (prev ? `${prev}\n\n${quoted}\n\n` : `${quoted}\n\n`));
        window.setTimeout(() => {
          resizeTextarea(inRef.current);
          inRef.current?.focus();
        }, 0);
      },
      handleDrop: files.handleDrop,
      handleDragEnter: files.handleDragEnter,
      handleDragOver: files.handleDragOver,
      handleDragLeave: files.handleDragLeave,
      resetDragState: files.resetDragState,
    }),
    [files.handleDrop, files.handleDragEnter, files.handleDragOver, files.handleDragLeave, files.resetDragState],
  );

  const hintStyle = { marginBottom: 6, fontSize: s(10), fontFamily: "var(--font-mono)", letterSpacing: ".1em" } as const;

  return (
    <div style={{ padding: "12px 28px 24px", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        {props.permissionRequests && props.permissionRequests.length > 0 && (
          <PermissionRequests requests={props.permissionRequests} onRespond={props.onRespondPermission} />
        )}
        {props.queuedMessages && props.queuedMessages.length > 0 && (
          <QueuedMessages items={props.queuedMessages} onUpdate={props.onUpdateQueuedMessage} onRemove={props.onRemoveQueuedMessage} t={t} />
        )}
        {commands.length > 0 && (
          <SlashCommandPalette
            commands={commands}
            selectedIndex={selectedCmd}
            hasWallpaper={hasWallpaper}
            onPick={(cmd) => {
              setInput(cmd);
              setSelectedCmd(0);
            }}
            onHover={setSelectedCmd}
          />
        )}
        <ImagePreview items={attachments} onRemove={files.removeAttachment} />
        {shellMode && (
          <div style={{ ...hintStyle, color: "var(--text-muted)" }}>
            {canRunShell ? t("chatArea.shellModeReady", { loc: shellLocation }) : t("chatArea.shellModeEmpty")}
          </div>
        )}
        {showBranchHint && <div style={{ ...hintStyle, color: "var(--warning-text)" }}>{branchHintText}</div>}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: dragOver ? "var(--accent-bg)" : inputFocused ? "var(--control-bg)" : "var(--control-bg-subtle)",
            border: `${shellMode ? "2px" : "1px"} solid ${dragOver ? "var(--accent-border)" : inputFocused ? "var(--control-border-strong)" : "var(--control-border)"}`,
            borderRadius: 12,
            padding: shellMode ? "8px 13px" : "9px 14px",
            // Blur only does anything over a wallpaper; without one it re-blurs every scroll frame for nothing.
            backdropFilter: hasWallpaper ? "blur(20px)" : "none",
            boxShadow: dragOver ? "0 0 0 1px rgba(153,214,255,0.08)" : "none",
            transition: "border-color .25s, background .25s, box-shadow .25s",
          }}
        >
          <textarea
            ref={inRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onPaste={files.handlePaste}
            onFocus={() => setInputFocused(true)}
            onBlur={() => {
              composingRef.current = false;
              setInputFocused(false);
            }}
            placeholder={setupRequired && !shellMode ? "Install a runtime to start chatting" : shellMode ? t("chatArea.placeholderShell") : t("chatArea.placeholderAsk")}
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              resize: "none",
              color: "var(--text-primary)",
              fontSize: s(13),
              lineHeight: 1.5,
              fontFamily: "var(--font-ui)",
              maxHeight: INPUT_MAX_HEIGHT,
              height: "auto",
              display: "block",
              overflow: "auto",
            }}
          />
          {isStreaming && !trimmedInput ? (
            <button
              type="button"
              onClick={onCancel}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                borderRadius: 8,
                flexShrink: 0,
                background: "var(--control-bg-strong)",
                border: "1px solid var(--control-border-strong)",
                color: "var(--text-muted)",
                cursor: "pointer",
                transition: "background .2s",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "var(--control-bg-active)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "var(--control-bg-strong)";
              }}
            >
              <Square size={10} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: shellMode ? 6 : 0,
                width: shellMode ? "auto" : 30,
                height: 30,
                padding: shellMode ? "0 12px" : 0,
                borderRadius: 8,
                flexShrink: 0,
                background: canSend ? "var(--text-primary)" : "var(--control-bg-subtle)",
                border: "none",
                color: canSend ? "var(--text-inverse)" : "var(--text-faint)",
                cursor: canSend ? "pointer" : "default",
                transition: "background .3s cubic-bezier(.16,1,.3,1), color .3s, transform .3s cubic-bezier(.16,1,.3,1)",
                transform: canSend ? "scale(1)" : "scale(0.88)",
              }}
            >
              {shellMode ? (
                <>
                  <TerminalIcon size={14} strokeWidth={1.6} />
                  <span style={{ fontSize: s(10), fontFamily: "var(--font-mono)", letterSpacing: ".1em" }}>{t("chatArea.run")}</span>
                </>
              ) : (
                <ArrowRight size={16} strokeWidth={1.5} />
              )}
            </button>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 8, fontSize: s(8), fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: ".1em" }}>
          {shellMode ? (canRunShell ? t("chatArea.hintShellRun") : t("chatArea.hintShellEmpty")) : t("chatArea.hintChat")}
        </div>
      </div>
    </div>
  );
}

export default memo(ChatComposer);
