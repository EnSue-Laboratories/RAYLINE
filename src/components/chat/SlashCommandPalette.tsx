import { useFontScale } from "../../contexts/FontSizeContext";

export interface SlashCommandOption {
  cmd: string;
  desc: string;
}

interface SlashCommandPaletteProps {
  commands: readonly SlashCommandOption[];
  selectedIndex: number;
  hasWallpaper: boolean;
  onPick: (command: string) => void;
  onHover: (index: number) => void;
}

export default function SlashCommandPalette({ commands, selectedIndex, hasWallpaper, onPick, onHover }: SlashCommandPaletteProps) {
  const s = useFontScale();
  return (
    <div
      style={{
        marginBottom: 6,
        background: hasWallpaper ? "var(--pane-elevated)" : "var(--overlay-surface)",
        border: "1px solid var(--control-border)",
        borderRadius: 10,
        padding: "4px",
        // Blur only matters over a wallpaper; skip the per-frame re-blur otherwise.
        backdropFilter: hasWallpaper ? "blur(20px)" : "none",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      {commands.map((command, index) => (
        <div
          key={command.cmd}
          onClick={() => onPick(command.cmd)}
          onMouseEnter={() => onHover(index)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 10px",
            borderRadius: 7,
            cursor: "pointer",
            background: index === selectedIndex ? "var(--control-bg)" : "transparent",
            transition: "background .1s",
          }}
        >
          <span style={{ fontSize: s(12), fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{command.cmd}</span>
          <span style={{ fontSize: s(11), color: "var(--text-disabled)", fontFamily: "var(--font-ui)" }}>{command.desc}</span>
        </div>
      ))}
    </div>
  );
}
