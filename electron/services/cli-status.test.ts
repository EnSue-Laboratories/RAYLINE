import { describe, expect, it } from "vitest";
import { parseCliVersion } from "./cli-status";

describe("parseCliVersion", () => {
  it("extracts the first semver-looking token", () => {
    expect(parseCliVersion("2.1.3 (Claude Code)")).toBe("2.1.3");
    expect(parseCliVersion("codex-cli 0.46.0\n")).toBe("0.46.0");
    expect(parseCliVersion("opencode v1.2.0-beta.1")).toBe("1.2.0-beta.1");
    expect(parseCliVersion("grok 4.7")).toBe("4.7");
    expect(parseCliVersion("no version here")).toBeNull();
  });
});
