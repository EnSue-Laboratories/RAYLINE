import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./pm-index.css";

function ProjectManager() {
  return <div>GitHub Projects</div>;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ProjectManager />
  </StrictMode>
);
