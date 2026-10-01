/**
 * Electron main-process entry: app identity, single-instance lock, then the
 * typed AppContext, IPC handlers and lifecycle. Everything else lives in
 * electron/app (windows, lifecycle), electron/ipc (handlers) and
 * electron/services (disk / process work).
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { app } from "electron";
import { createAppContext } from "./app/context";
import { warmLoginShellPath } from "./cli-bin-resolver";
import { registerAppLifecycle } from "./app/lifecycle";
import { registerIpc } from "./ipc";

const APP_NAME = "RayLine";

// Override app name (in dev, Electron uses its own binary name). Must run
// before anything reads app.getPath("userData").
app.setName(APP_NAME);

// Explicit profile override for packaged smoke tests and separate dev profiles (PR #230).
if (process.env.RAYLINE_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.RAYLINE_USER_DATA_DIR));
}

if (!app.isPackaged && process.platform === "darwin") {
  // Patch the dock name of the dev Electron bundle (async; never blocks startup).
  const plist = path.join(path.dirname(process.execPath), "..", "Info.plist");
  for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
    execFile("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${APP_NAME}`, plist], () => undefined);
  }
}

// Packaged builds run as a single instance; a second launch focuses the first (PR #230).
if (app.isPackaged && !app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  // Capture the login shell PATH in the background so CLI lookups never block.
  void warmLoginShellPath();
  const ctx = createAppContext();
  registerIpc(ctx);
  registerAppLifecycle(ctx);
}
