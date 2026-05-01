import applyBootstrapTheme from "./utils/themeBootstrap.js";
applyBootstrapTheme();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

const root = container.__raylineRoot || createRoot(container);
container.__raylineRoot = root;

root.render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
