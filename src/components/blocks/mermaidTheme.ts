/**
 * Mermaid `base` theme variables for RayLine's light / dark themes. Static
 * palettes are overridden by the live CSS variables at init time.
 */

import { readRootCssVar, type ResolvedThemeMode } from "./themeMode";

/** Subset of mermaid `themeVariables` RayLine sets (all strings except darkMode). */
export interface MermaidThemeVariables {
  darkMode: boolean;
  background: string;
  mainBkg: string;
  nodeBorder: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  primaryBorderColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  tertiaryTextColor: string;
  lineColor: string;
  fontFamily: string;
  pie2: string;
  pie3: string;
  pie4: string;
  [name: string]: string | boolean;
}

const DARK_THEME_VARIABLES: MermaidThemeVariables = {
  darkMode: true,
  background: "#0a0a0a",
  mainBkg: "#1a1a1a",
  nodeBorder: "rgba(255,255,255,0.25)",
  clusterBkg: "#111111",
  clusterBorder: "rgba(255,255,255,0.15)",
  titleColor: "rgba(255,255,255,0.85)",

  // Text colors
  primaryTextColor: "rgba(255,255,255,0.85)",
  secondaryTextColor: "rgba(255,255,255,0.6)",
  tertiaryTextColor: "rgba(255,255,255,0.5)",

  // Line/edge colors
  lineColor: "rgba(255,255,255,0.35)",
  textColor: "rgba(255,255,255,0.8)",

  // Node colors - soft blues/teals instead of pink
  primaryColor: "#1e3a5f",
  primaryBorderColor: "#3b82c4",
  secondaryColor: "#1a2e3e",
  secondaryBorderColor: "#4a90b8",
  tertiaryColor: "#1e2d3d",
  tertiaryBorderColor: "#5a9ab5",

  // Git graph - white lines, dark text on light labels
  git0: "#ffffff",
  git1: "#aaaaaa",
  git2: "#cccccc",
  git3: "#888888",
  git4: "#dddddd",
  git5: "#bbbbbb",
  git6: "#999999",
  git7: "#eeeeee",
  gitBranchLabel0: "#000000",
  gitBranchLabel1: "#000000",
  gitBranchLabel2: "#000000",
  gitBranchLabel3: "#000000",
  gitBranchLabel4: "#000000",
  gitBranchLabel5: "#000000",
  gitBranchLabel6: "#000000",
  gitBranchLabel7: "#000000",
  gitInv0: "#000000",
  commitLabelColor: "rgba(255,255,255,0.7)",
  commitLabelBackground: "rgba(255,255,255,0.08)",

  // Pie chart
  pie1: "#3b82c4",
  pie2: "#6ab04c",
  pie3: "#e2b93d",
  pie4: "#e07b4c",
  pie5: "#9b59b6",
  pie6: "#1abc9c",
  pie7: "#e67e22",
  pie8: "#2ecc71",
  pieTitleTextColor: "rgba(255,255,255,0.85)",
  pieSectionTextColor: "rgba(255,255,255,0.9)",
  pieLegendTextColor: "rgba(255,255,255,0.7)",
  pieStrokeColor: "rgba(255,255,255,0.1)",
  pieSectionTextSize: "14px",
  pieOuterStrokeColor: "rgba(255,255,255,0.1)",

  // Notes
  noteBkgColor: "#1a2530",
  noteTextColor: "rgba(255,255,255,0.8)",
  noteBorderColor: "rgba(255,255,255,0.15)",

  // Sequence diagram
  actorBkg: "#1a2530",
  actorBorder: "rgba(255,255,255,0.25)",
  actorTextColor: "rgba(255,255,255,0.85)",
  signalColor: "rgba(255,255,255,0.7)",
  labelBoxBkgColor: "#1a2530",

  // Flowchart
  edgeLabelBackground: "#0a0a0a",

  // Class diagram
  classText: "rgba(255,255,255,0.8)",

  // Font
  fontFamily: "var(--font-ui)",
  fontSize: "13px",
};

const LIGHT_THEME_VARIABLES: MermaidThemeVariables = {
  darkMode: false,
  background: "#ffffff",
  mainBkg: "#ffffff",
  nodeBorder: "#cbd5e1",
  clusterBkg: "#f8fafc",
  clusterBorder: "#cbd5e1",
  titleColor: "#1f2937",

  // Text colors
  primaryTextColor: "#1f2937",
  secondaryTextColor: "#1f2937",
  tertiaryTextColor: "#1f2937",

  // Line/edge colors
  lineColor: "#475569",
  textColor: "#1f2937",

  // Node colors
  primaryColor: "#ffffff",
  primaryBorderColor: "#2563eb",
  secondaryColor: "#f8fafc",
  secondaryBorderColor: "#0f766e",
  tertiaryColor: "#f8fafc",
  tertiaryBorderColor: "#64748b",

  // Git graph
  git0: "#2563eb",
  git1: "#0f766e",
  git2: "#7c3aed",
  git3: "#b45309",
  git4: "#475569",
  git5: "#0369a1",
  git6: "#be123c",
  git7: "#4d7c0f",
  gitBranchLabel0: "#1f2937",
  gitBranchLabel1: "#1f2937",
  gitBranchLabel2: "#1f2937",
  gitBranchLabel3: "#1f2937",
  gitBranchLabel4: "#1f2937",
  gitBranchLabel5: "#1f2937",
  gitBranchLabel6: "#1f2937",
  gitBranchLabel7: "#1f2937",
  gitInv0: "#ffffff",
  commitLabelColor: "#1f2937",
  commitLabelBackground: "#f8fafc",

  // Pie chart
  pie1: "#2563eb",
  pie2: "#0f766e",
  pie3: "#b45309",
  pie4: "#be123c",
  pie5: "#7c3aed",
  pie6: "#0369a1",
  pie7: "#4d7c0f",
  pie8: "#9333ea",
  pieTitleTextColor: "#1f2937",
  pieSectionTextColor: "#1f2937",
  pieLegendTextColor: "#1f2937",
  pieStrokeColor: "#cbd5e1",
  pieSectionTextSize: "14px",
  pieOuterStrokeColor: "#cbd5e1",

  // Notes
  noteBkgColor: "#f8fafc",
  noteTextColor: "#1f2937",
  noteBorderColor: "#cbd5e1",

  // Sequence diagram
  actorBkg: "#ffffff",
  actorBorder: "#cbd5e1",
  actorTextColor: "#1f2937",
  signalColor: "#475569",
  labelBoxBkgColor: "#ffffff",

  // Flowchart
  edgeLabelBackground: "#ffffff",

  // Class diagram
  classText: "#1f2937",

  // Font
  fontFamily: "var(--font-ui)",
  fontSize: "13px",
};

export function getMermaidThemeVariables(mode: ResolvedThemeMode): MermaidThemeVariables {
  const base = mode === "light" ? LIGHT_THEME_VARIABLES : DARK_THEME_VARIABLES;
  const bg = readRootCssVar("--bg-primary", base.background);
  const surface = readRootCssVar("--surface-glass", base.mainBkg);
  const surfaceStrong = readRootCssVar("--control-bg-contrast", base.secondaryColor);
  const border = readRootCssVar("--border-strong", base.nodeBorder);
  const accent = readRootCssVar("--accent", base.primaryBorderColor);
  const success = readRootCssVar("--success-text", base.pie2);
  const danger = readRootCssVar("--danger-text", base.pie4);
  const warning = readRootCssVar("--warning-text", base.pie3);
  const text = readRootCssVar("--text-primary", base.primaryTextColor);
  const textSecondary = readRootCssVar("--text-secondary", base.secondaryTextColor);
  const textMuted = readRootCssVar("--text-muted", base.tertiaryTextColor);
  const line = readRootCssVar("--mermaid-line", base.lineColor);
  const fontFamily = readRootCssVar("--font-ui", base.fontFamily);

  return {
    ...base,
    background: bg,
    mainBkg: surface,
    nodeBorder: border,
    clusterBkg: surfaceStrong,
    clusterBorder: border,
    titleColor: text,
    primaryTextColor: text,
    secondaryTextColor: textSecondary,
    tertiaryTextColor: textMuted,
    lineColor: line,
    textColor: text,
    primaryColor: readRootCssVar("--accent-bg", base.primaryColor),
    primaryBorderColor: accent,
    secondaryColor: readRootCssVar("--success-bg", base.secondaryColor),
    secondaryBorderColor: success,
    tertiaryColor: readRootCssVar("--warning-bg", base.tertiaryColor),
    tertiaryBorderColor: warning,
    git0: accent,
    git1: success,
    git2: warning,
    git3: danger,
    commitLabelColor: textSecondary,
    commitLabelBackground: surface,
    pie1: accent,
    pie2: success,
    pie3: warning,
    pie4: danger,
    pieTitleTextColor: text,
    pieSectionTextColor: text,
    pieLegendTextColor: textSecondary,
    pieStrokeColor: border,
    pieOuterStrokeColor: border,
    noteBkgColor: surfaceStrong,
    noteTextColor: textSecondary,
    noteBorderColor: border,
    actorBkg: surface,
    actorBorder: border,
    actorTextColor: text,
    signalColor: textSecondary,
    labelBoxBkgColor: surface,
    edgeLabelBackground: bg,
    classText: textSecondary,
    fontFamily,
  };
}
