import applyBootstrapTheme from "./utils/themeBootstrap";
applyBootstrapTheme();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./pm-index.css";
import ProjectManager from "./ProjectManager";
import { ThemeProvider } from "./contexts/ThemeContext";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <ProjectManager />
    </ThemeProvider>
  </StrictMode>,
);
