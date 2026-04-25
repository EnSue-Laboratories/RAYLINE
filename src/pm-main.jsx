import applyBootstrapTheme from "./utils/themeBootstrap.js";
applyBootstrapTheme();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./pm-index.css";
import ProjectManager from "./ProjectManager";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemeProvider>
      <ProjectManager />
    </ThemeProvider>
  </StrictMode>
);
