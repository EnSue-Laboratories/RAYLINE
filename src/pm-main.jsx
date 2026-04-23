import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./pm-index.css";
import ProjectManager from "./ProjectManager";

// Inject a close button directly into the DOM — no React dependency
const closeBtn = document.createElement("button");
closeBtn.textContent = "✕";
Object.assign(closeBtn.style, {
  position: "fixed",
  top: "12px",
  right: "14px",
  zIndex: "9999",
  width: "28px",
  height: "28px",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.35)",
  fontSize: "18px",
  lineHeight: "1",
  cursor: "pointer",
  padding: "0",
  WebkitAppRegion: "no-drag",
});
closeBtn.addEventListener("mouseenter", () => {
  closeBtn.style.color = "rgba(255,255,255,0.85)";
});
closeBtn.addEventListener("mouseleave", () => {
  closeBtn.style.color = "rgba(255,255,255,0.35)";
});
closeBtn.addEventListener("click", () => window.ghApi?.windowClose());
document.body.appendChild(closeBtn);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ProjectManager />
  </StrictMode>
);
