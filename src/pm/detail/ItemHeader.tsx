import type { GhLabel } from "@shared/github/types";
import type { StateBadge } from "./detailState";
import { MONO_FONT, SYSTEM_FONT } from "../styles";

interface ItemHeaderProps {
  number: number;
  title: string;
  url: string;
  badge: StateBadge;
  subtitle: string;
  labels: GhLabel[];
}

/** "#123 Title [STATE]", the opened-by line, and label chips. */
export default function ItemHeader({ number, title, url, badge, subtitle, labels }: ItemHeaderProps) {
  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO_FONT, fontSize: 14, color: "var(--text-disabled)" }}>#{number}</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: SYSTEM_FONT,
              textDecoration: "none",
              transition: "color .15s",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--link-text-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          >
            {title}
          </a>
          <span
            style={{
              fontSize: 10,
              fontFamily: MONO_FONT,
              letterSpacing: ".06em",
              padding: "2px 8px",
              borderRadius: 10,
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-disabled)", fontFamily: SYSTEM_FONT, marginTop: 4 }}>{subtitle}</div>
      </div>

      {labels.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {labels.map((label) => {
            const hex = `#${label.color}`;
            return (
              <span
                key={label.id || label.name}
                style={{
                  fontSize: 10,
                  fontFamily: MONO_FONT,
                  letterSpacing: ".03em",
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: `${hex}33`,
                  color: hex,
                  border: `1px solid ${hex}44`,
                }}
              >
                {label.name}
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}
