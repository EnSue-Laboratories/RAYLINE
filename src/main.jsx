import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

const root = container.__raylineRoot || createRoot(container);
container.__raylineRoot = root;

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
