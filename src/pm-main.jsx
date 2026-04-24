import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./pm-index.css";
import ProjectManager from "./ProjectManager";

function applyThemeMode(mode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (mode === "light") document.documentElement.dataset.theme = "light";
  else if (mode === "dark") document.documentElement.dataset.theme = "dark";
  else document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
}

applyThemeMode("auto");
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const current = document.documentElement.dataset.theme;
  if (!current || current === "auto") applyThemeMode("auto");
});

if (window.ghApi?.onThemeMode) {
  window.ghApi.onThemeMode(applyThemeMode);
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ProjectManager />
  </StrictMode>
);
