import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./pm-index.css";
import ProjectManager from "./ProjectManager";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ProjectManager />
  </StrictMode>
);
