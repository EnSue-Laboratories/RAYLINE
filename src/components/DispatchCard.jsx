import { useState, useCallback } from "react";
import { X, GitBranch, FileText } from "lucide-react";

export default function DispatchCard({
  onClose,
  // eslint-disable-next-line no-unused-vars
  onDispatch,
  currentCwd,
  projects,
  defaultModel = "sonnet",
  availableModels = [],
}) {
  const [tab, setTab] = useState("issues"); // "issues" | "custom"
  const [globalModel, setGlobalModel] = useState(defaultModel);
  const [customRows, setCustomRows] = useState([]);
  const [issueRows, setIssueRows] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [submitting, setSubmitting] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [errors, setErrors] = useState({}); // rowKey -> message

  const activeRows = tab === "issues"
    ? issueRows.filter((r) => r.enabled)
    : customRows;
  const canDispatch = activeRows.length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    // Implemented in Task 7
  }, []);

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <div style={titleStyle}>Dispatch</div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div style={tabsStyle}>
          <TabBtn active={tab === "issues"} onClick={() => setTab("issues")}>
            <GitBranch size={13} /> From Issues
          </TabBtn>
          <TabBtn active={tab === "custom"} onClick={() => setTab("custom")}>
            <FileText size={13} /> Custom
          </TabBtn>
        </div>

        <div style={bodyStyle}>
          {tab === "issues" ? (
            <IssueTab
              rows={issueRows}
              setRows={setIssueRows}
              projects={projects}
              currentCwd={currentCwd}
              availableModels={availableModels}
              errors={errors}
            />
          ) : (
            <CustomTab
              rows={customRows}
              setRows={setCustomRows}
              currentCwd={currentCwd}
              availableModels={availableModels}
              errors={errors}
            />
          )}
        </div>

        <footer style={footerStyle}>
          <ModelDropdown
            value={globalModel}
            onChange={setGlobalModel}
            models={availableModels}
            label="Default model"
          />
          <button
            onClick={handleSubmit}
            disabled={!canDispatch}
            style={primaryBtnStyle(canDispatch)}
          >
            Dispatch {activeRows.length || 0} task{activeRows.length === 1 ? "" : "s"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={tabBtnStyle(active)}>{children}</button>
  );
}

// Placeholder stubs — filled in by Tasks 5 & 6
function IssueTab() { return <div style={{ padding: 12, color: "rgba(255,255,255,0.5)" }}>Issue tab (Task 6)</div>; }
function CustomTab() { return <div style={{ padding: 12, color: "rgba(255,255,255,0.5)" }}>Custom tab (Task 5)</div>; }
function ModelDropdown({ value, onChange, models, label }) {
  return (
    <label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ background: "rgba(255,255,255,0.05)", color: "white", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, padding: "4px 6px" }}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>{m.label || m.id}</option>
        ))}
      </select>
    </label>
  );
}

// Styles — mirror NewChatCard.jsx conventions
const backdropStyle = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, backdropFilter: "blur(6px)",
};
const cardStyle = {
  width: 820, maxWidth: "90vw", maxHeight: "85vh",
  background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10, display: "flex", flexDirection: "column",
  color: "white", fontFamily: "system-ui, sans-serif", fontSize: 13,
};
const headerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)",
};
const titleStyle = { fontSize: 14, fontWeight: 500 };
const closeBtnStyle = {
  background: "none", border: "none", color: "rgba(255,255,255,0.55)",
  cursor: "pointer", padding: 4,
};
const tabsStyle = {
  display: "flex", gap: 4, padding: "10px 14px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};
const tabBtnStyle = (active) => ({
  display: "flex", gap: 6, alignItems: "center",
  padding: "8px 12px", borderRadius: "6px 6px 0 0",
  background: active ? "rgba(255,255,255,0.06)" : "transparent",
  color: active ? "white" : "rgba(255,255,255,0.55)",
  border: "none", borderBottom: active ? "1px solid white" : "1px solid transparent",
  cursor: "pointer", fontSize: 12,
});
const bodyStyle = { flex: 1, overflow: "auto", padding: 0 };
const footerStyle = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "12px 18px", borderTop: "1px solid rgba(255,255,255,0.06)",
};
const primaryBtnStyle = (enabled) => ({
  padding: "8px 14px", borderRadius: 6, border: "none",
  background: enabled ? "white" : "rgba(255,255,255,0.15)",
  color: enabled ? "black" : "rgba(255,255,255,0.4)",
  cursor: enabled ? "pointer" : "not-allowed",
  fontSize: 12, fontWeight: 500,
});
