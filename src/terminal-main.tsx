import applyBootstrapTheme from "./utils/themeBootstrap";
applyBootstrapTheme();

import { createRoot } from "react-dom/client";
import "./index.css";
import TerminalWindow from "./TerminalWindow";
import { ThemeProvider } from "./contexts/ThemeContext";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

createRoot(container).render(
  <ThemeProvider>
    <TerminalWindow />
  </ThemeProvider>,
);
