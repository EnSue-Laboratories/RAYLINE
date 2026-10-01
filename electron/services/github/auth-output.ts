/**
 * Pure state machine over `gh auth login --web` terminal output: extracts the
 * one-time code, decides which prompts to answer, and detects success.
 */

import type { GhAuthEvent } from "@shared/github/types";

export const DEVICE_URL = "https://github.com/login/device";
const BUFFER_MAX = 32 * 1024;
const BUFFER_KEEP = 16 * 1024;

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

export interface AuthStep {
  /** Keystrokes to send to gh, in order. */
  writes: string[];
  /** UI events to emit, in order. */
  events: GhAuthEvent[];
  /** Set once gh printed the logged-in marker. */
  successUser?: string;
}

export interface AuthOutputParser {
  push(chunk: string): AuthStep;
  readonly buffer: string;
  readonly codeSeen: boolean;
  readonly authenticated: boolean;
}

export function createAuthOutputParser(): AuthOutputParser {
  let buffer = "";
  let codeSeen = false;
  let enterSent = false;
  let browserEventSent = false;
  let gitCredPromptAnswered = false;
  let authenticated = false;

  return {
    get buffer() {
      return buffer;
    },
    get codeSeen() {
      return codeSeen;
    },
    get authenticated() {
      return authenticated;
    },
    push(chunk) {
      const step: AuthStep = { writes: [], events: [] };
      buffer += stripAnsi(chunk);
      // Cap the buffer so long flows don't grow unbounded.
      if (buffer.length > BUFFER_MAX) buffer = buffer.slice(-BUFFER_KEEP);

      const openBrowser = (): void => {
        if (browserEventSent) return;
        browserEventSent = true;
        step.events.push({ type: "browser", url: DEVICE_URL });
      };

      if (!codeSeen) {
        const code = /one-time code:\s*([A-Z0-9][A-Z0-9-]{3,})/i.exec(buffer)?.[1];
        if (code) {
          codeSeen = true;
          step.events.push({ type: "code", code });
          // Open the device page and advance gh as soon as the code is
          // visible instead of relying on exact prompt wording.
          openBrowser();
          if (!enterSent) {
            enterSent = true;
            step.writes.push("\r");
          }
        }
      }

      if (!enterSent && /Press Enter to open/i.test(buffer)) {
        enterSent = true;
        step.writes.push("\r");
        openBrowser();
      }

      // Confirm any "already logged in … re-authenticate? (Y/n)".
      if (/already logged into.*re-authenticate/i.test(buffer) && /\(Y\/n\)/i.test(buffer)) {
        step.writes.push("y\r");
      }

      // gh ≥ 2.89 asks this before the one-time code; default is Yes.
      if (!gitCredPromptAnswered && /Authenticate Git with your GitHub credentials\??/i.test(buffer)) {
        gitCredPromptAnswered = true;
        step.writes.push("\r");
      }

      if (!authenticated) {
        const user = /Logged in as ([^\s*!]+)/i.exec(buffer)?.[1] ?? /✓ Logged in as ([^\s*!]+)/i.exec(buffer)?.[1];
        if (user) {
          authenticated = true;
          step.successUser = user;
        }
      }
      return step;
    },
  };
}
