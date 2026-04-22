import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import TerminalWindow from "./TerminalWindow";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

createRoot(container).render(
  <StrictMode>
    <TerminalWindow />
  </StrictMode>
);
