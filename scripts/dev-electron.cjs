"use strict";

const { spawn } = require("child_process");

const electronBinary = require("electron");
const port = process.argv[2] || process.env.VITE_PORT || "5173";

const child = spawn(electronBinary, ["."], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_PORT: port,
  },
});

function forwardSignal(signal) {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("error", (error) => {
  console.error("[dev-electron] Failed to launch Electron:", error.message);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
