export const RUNTIME_SETUP_DOCS = {
  claude: "https://code.claude.com/docs/en/setup",
  codex: "https://developers.openai.com/codex/cli",
  opencode: "https://opencode.ai/docs",
};

export const RUNTIME_SETUP_PROVIDERS = [
  {
    id: "codex",
    name: "Codex",
    eyebrow: "OpenAI",
    description: "Use your ChatGPT account with the Codex CLI.",
    primary: true,
    installNote: "Official install path uses npm.",
  },
  {
    id: "claude",
    name: "Claude Code",
    eyebrow: "Anthropic",
    description: "Use your Anthropic account with the native Claude Code installer.",
    primary: true,
    installNote: "Native installer, no Node dependency.",
  },
  {
    id: "opencode",
    name: "OpenCode",
    eyebrow: "Optional",
    description: "Bring your own provider or API key.",
    primary: false,
    installNote: "Provider setup is still required after install.",
  },
];

const UNIX_COMMANDS = {
  codex: {
    install: `printf '\\033[1mRayLine Codex setup\\033[0m\\n'
if ! command -v npm >/dev/null 2>&1; then
  echo "Codex CLI's official install path uses npm."
  echo "Install Node.js/npm first, or open the Codex docs from RayLine."
  exit 1
fi
if npm i -g @openai/codex; then
  hash -r 2>/dev/null || true
  echo
  echo "Starting Codex sign-in..."
  if command -v codex >/dev/null 2>&1; then
    codex
  else
    echo "Codex installed, but it is not on PATH in this shell yet."
    echo "Open a new terminal or add npm's global bin directory to PATH."
  fi
fi`,
    signin: "codex",
  },
  claude: {
    install: `printf '\\033[1mRayLine Claude Code setup\\033[0m\\n'
set -o pipefail
if curl -fsSL https://claude.ai/install.sh | bash; then
  hash -r 2>/dev/null || true
  echo
  echo "Starting Claude Code sign-in..."
  if command -v claude >/dev/null 2>&1; then
    claude
  else
    echo "Claude Code installed, but it is not on PATH in this shell yet."
    echo "Open a new terminal and run: claude"
  fi
fi`,
    signin: "claude",
  },
  opencode: {
    install: `printf '\\033[1mRayLine OpenCode setup\\033[0m\\n'
set -o pipefail
if curl -fsSL https://opencode.ai/install | bash; then
  hash -r 2>/dev/null || true
  echo
  echo "Starting OpenCode..."
  if command -v opencode >/dev/null 2>&1; then
    opencode
  else
    echo "OpenCode installed, but it is not on PATH in this shell yet."
    echo "Open a new terminal and run: opencode"
  fi
fi`,
    signin: "opencode",
  },
};

const WINDOWS_COMMANDS = {
  codex: {
    install: `Write-Host "RayLine Codex setup"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "Codex CLI's official install path uses npm."
  Write-Host "Install Node.js/npm first, or open the Codex docs from RayLine."
  exit 1
}
npm i -g @openai/codex
if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Starting Codex sign-in..."
  if (Get-Command codex -ErrorAction SilentlyContinue) {
    codex
  } else {
    Write-Host "Codex installed, but it is not on PATH in this shell yet."
    Write-Host "Open a new terminal or add npm's global bin directory to PATH."
  }
}`,
    signin: "codex",
  },
  claude: {
    install: `Write-Host "RayLine Claude Code setup"
try {
  irm https://claude.ai/install.ps1 | iex
  $raylineClaudeInstalled = $true
} catch {
  Write-Error $_
  $raylineClaudeInstalled = $false
}
if ($raylineClaudeInstalled) {
  Write-Host ""
  Write-Host "Starting Claude Code sign-in..."
  if (Get-Command claude -ErrorAction SilentlyContinue) {
    claude
  } else {
    Write-Host "Claude Code installed, but it is not on PATH in this shell yet."
    Write-Host "Open a new terminal and run: claude"
  }
}`,
    signin: "claude",
  },
  opencode: {
    install: `Write-Host "RayLine OpenCode setup"
if (Get-Command npm -ErrorAction SilentlyContinue) {
  npm i -g opencode-ai
  if ($LASTEXITCODE -eq 0 -and (Get-Command opencode -ErrorAction SilentlyContinue)) {
    opencode
  }
} else {
  Write-Host "OpenCode's automatic Windows setup currently expects npm or WSL."
  Write-Host "Open the OpenCode docs from RayLine for the official Windows guidance."
}`,
    signin: "opencode",
  },
};

export function getRuntimeSetupCommand(providerId, action = "install", platform = "") {
  const table = platform === "win32" ? WINDOWS_COMMANDS : UNIX_COMMANDS;
  return table[providerId]?.[action] || "";
}

export function getRuntimeSetupShell(platform = "") {
  if (platform !== "win32") return undefined;
  return "powershell.exe";
}
