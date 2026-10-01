/** Cloning repositories into a chosen parent directory. */

import { cloneRepo } from "../services/project-clone";
import { handle } from "./typed";

export function registerProjectIpc(): void {
  handle("project-clone", (_event, request) => cloneRepo(request));
}
