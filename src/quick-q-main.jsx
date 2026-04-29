import { createRoot } from "react-dom/client";
import "./index.css";
import QuickQWindow from "./QuickQWindow";
import { FontSizeContext } from "./contexts/FontSizeContext";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container #root was not found.");
}

createRoot(container).render(
  <FontSizeContext.Provider value={14}>
    <QuickQWindow />
  </FontSizeContext.Provider>
);
