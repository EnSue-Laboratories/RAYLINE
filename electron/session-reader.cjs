const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");

function projectDirName(cwd) {
  return cwd.replace(/\//g, "-");
}

async function listSessions(cwd) {
  const projectDir = path.join(CLAUDE_DIR, "projects", projectDirName(cwd));

  if (!fs.existsSync(projectDir)) return [];

  const files = fs.readdirSync(projectDir).filter((f) => f.endsWith(".jsonl"));
  const sessions = [];

  for (const file of files) {
    const sessionId = file.replace(".jsonl", "");
    const filePath = path.join(projectDir, file);
    const stat = fs.statSync(filePath);

    let title = "Untitled";
    let model = null;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").slice(0, 50);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "user" || (evt.role === "user" && evt.type === "message")) {
            const text = evt.message?.content || evt.text || evt.display || "";
            if (typeof text === "string" && text.length > 0) {
              title = text.slice(0, 60);
              break;
            }
            if (Array.isArray(text)) {
              const t = text.find((b) => b.type === "text");
              if (t) { title = t.text.slice(0, 60); break; }
            }
          }
        } catch {}
      }
    } catch {}

    sessions.push({ id: sessionId, title, model, ts: stat.mtimeMs, cwd });
  }

  sessions.sort((a, b) => b.ts - a.ts);
  return sessions;
}

module.exports = { listSessions };
