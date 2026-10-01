import { memo, type ReactNode } from "react";
import type { AppearanceProfile } from "@shared/state/types";
import { LOGO_RED, type FontScale } from "./deps";

export interface AppearancePreviewLabels {
  accent: string;
  surface: string;
  text: string;
  success: string;
  danger: string;
  warning: string;
  logo: string;
  guideTitle: string;
  logoUse: string;
  accentUse: string;
  successUse: string;
  dangerUse: string;
  warningUse: string;
  surfaceTextUse: string;
}

interface AppearancePreviewProps {
  profile: AppearanceProfile;
  labels: AppearancePreviewLabels;
  s: FontScale;
}

/** Live preview of the profile being edited (diff colors + usage guide). */
export const AppearancePreview = memo(function AppearancePreview({ profile, labels, s }: AppearancePreviewProps) {
  const { palette, typography } = profile;
  const border = `color-mix(in srgb, ${palette.border} 18%, transparent)`;
  const softSurface = `color-mix(in srgb, ${palette.surfaceStrong} 64%, ${palette.background})`;
  const muted = `color-mix(in srgb, ${palette.text} 42%, transparent)`;
  const guide = [
    { label: labels.logo, value: LOGO_RED, use: labels.logoUse },
    { label: labels.accent, value: palette.accent, use: labels.accentUse },
    { label: labels.success, value: palette.success, use: labels.successUse },
    { label: labels.danger, value: palette.danger, use: labels.dangerUse },
    { label: labels.warning, value: palette.warning, use: labels.warningUse },
  ];

  return (
    <div
      style={{
        marginBottom: 14,
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${border}`,
        background: palette.background,
        color: palette.text,
        fontFamily: typography.uiFont,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 98, background: palette.surface }}>
        <PreviewCodeSide
          tokenColor={palette.danger}
          tokenName="danger"
          surface={softSurface}
          text={palette.text}
          muted={muted}
          monoFont={typography.monoFont}
          s={s}
          side="left"
        />
        <PreviewCodeSide
          tokenColor={palette.success}
          tokenName="success"
          surface={`color-mix(in srgb, ${palette.success} 16%, ${palette.surface})`}
          text={palette.text}
          muted={muted}
          monoFont={typography.monoFont}
          s={s}
          side="right"
        />
      </div>
      <div style={{ padding: 10, borderTop: `1px solid ${border}`, background: palette.surfaceStrong }}>
        <div
          style={{
            fontSize: s(10),
            color: `color-mix(in srgb, ${palette.text} 58%, transparent)`,
            marginBottom: 8,
            fontWeight: 600,
          }}
        >
          {labels.guideTitle}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {guide.map((item) => (
            <GuideItem
              key={item.label}
              s={s}
              text={palette.text}
              swatch={<Swatch border={border} background={item.value} round />}
              label={item.label}
              use={item.use}
            />
          ))}
          <GuideItem
            s={s}
            text={palette.text}
            swatch={
              <Swatch
                border={border}
                background={`linear-gradient(135deg, ${palette.surface} 0 50%, ${palette.text} 50% 100%)`}
              />
            }
            label={`${labels.surface} / ${labels.text}`}
            use={labels.surfaceTextUse}
          />
        </div>
      </div>
    </div>
  );
});

function Swatch({ border, background, round = false }: { border: string; background: string; round?: boolean }) {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: round ? 999 : 4,
        border: `1px solid ${border}`,
        background,
        marginTop: 2,
      }}
    />
  );
}

interface GuideItemProps {
  s: FontScale;
  text: string;
  swatch: ReactNode;
  label: string;
  use: string;
}

function GuideItem({ s, text, swatch, label, use }: GuideItemProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, minWidth: 0 }}>
      {swatch}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: s(10), color: `color-mix(in srgb, ${text} 76%, transparent)`, lineHeight: 1.25 }}>
          {label}
        </span>
        <span
          style={{
            display: "block",
            fontSize: s(9),
            color: `color-mix(in srgb, ${text} 46%, transparent)`,
            lineHeight: 1.25,
            marginTop: 1,
          }}
        >
          {use}
        </span>
      </span>
    </div>
  );
}

interface PreviewCodeSideProps {
  tokenColor: string;
  tokenName: string;
  surface: string;
  text: string;
  muted: string;
  monoFont: string;
  s: FontScale;
  side: "left" | "right";
}

function PreviewCodeSide({ tokenColor, tokenName, surface, text, muted, monoFont, s, side }: PreviewCodeSideProps) {
  const lines: ReactNode[] = [
    "themePreview = {",
    <>
      <span style={{ color: tokenColor }}>{tokenName}</span>: &quot;{tokenColor}&quot;,
    </>,
    "};",
  ];
  return (
    <div
      style={{
        padding: "12px 12px 10px",
        borderLeft: side === "right" ? `1px solid color-mix(in srgb, ${text} 10%, transparent)` : "none",
        background: surface,
        fontFamily: monoFont,
        fontSize: s(10),
        lineHeight: 1.8,
      }}
    >
      {lines.map((content, index) => (
        <div
          key={index}
          style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, color: index === 0 ? muted : text }}
        >
          <span style={{ color: muted, textAlign: "right" }}>{index + 1}</span>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{content}</span>
        </div>
      ))}
    </div>
  );
}
