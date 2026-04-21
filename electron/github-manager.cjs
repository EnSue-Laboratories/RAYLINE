const { execFile, spawn } = require("child_process");
const { buildSpawnPath, isExecutable, resolveCliBin } = require("./cli-bin-resolver.cjs");

// node-pty is a native module — load lazily so the manager still loads even
// if the prebuild is missing for the current Electron version.
let pty;
try {
  pty = require("node-pty");
} catch (e) {
  console.error("[github-manager] node-pty failed to load:", e.message);
}

function log(...args) {
  console.log("[github-manager]", ...args);
}

let cachedGhBin = null;

function resolveGhBin() {
  if (cachedGhBin && isExecutable(cachedGhBin)) return cachedGhBin;
  cachedGhBin = resolveCliBin("gh", { envVarName: "GH_BIN" });
  if (!cachedGhBin) {
    throw new Error("GitHub CLI (gh) not found. Install it from https://cli.github.com and ensure it is on your PATH.");
  }
  return cachedGhBin;
}

function ghEnv() {
  return { ...process.env, PATH: buildSpawnPath(), GH_NO_UPDATE_NOTIFIER: "1" };
}

/**
 * Execute a gh CLI command and return stdout.
 */
function gh(args) {
  return new Promise((resolve, reject) => {
    let bin;
    try { bin = resolveGhBin(); } catch (err) { reject(err); return; }
    execFile(bin, args, {
      env: ghEnv(),
      timeout: 15000,
      maxBuffer: 5 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout.trim());
    });
  });
}

/**
 * Execute a gh CLI command with JSON piped to stdin.
 */
function ghWithStdin(args, jsonBody) {
  return new Promise((resolve, reject) => {
    let bin;
    try { bin = resolveGhBin(); } catch (err) { reject(err); return; }
    const child = spawn(bin, args, {
      env: ghEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `gh exited with code ${code}`));
      else resolve(stdout.trim());
    });

    child.stdin.write(JSON.stringify(jsonBody));
    child.stdin.end();
  });
}

/**
 * Execute a gh CLI command with a raw string piped to stdin.
 */
function ghWithRawStdin(args, input) {
  return new Promise((resolve, reject) => {
    let bin;
    try { bin = resolveGhBin(); } catch (err) { reject(err); return; }
    const child = spawn(bin, args, {
      env: ghEnv(),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `gh exited with code ${code}`));
      else resolve(stdout.trim());
    });

    child.stdin.write(input || "");
    child.stdin.end();
  });
}

async function checkAuth() {
  try {
    const out = await gh(["auth", "status", "--hostname", "github.com"]);
    const user = parseAuthStatusUser(out);
    return { ok: true, user };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function parseAuthStatusUser(text) {
  if (!text) return null;
  // Match both newer ("account USERNAME") and older ("as USERNAME") phrasings.
  const m =
    text.match(/Logged in to [^\s]+ account ([^\s(]+)/i) ||
    text.match(/Logged in to [^\s]+ as ([^\s(]+)/i);
  return m ? m[1] : null;
}

// --- Interactive auth flow -------------------------------------------------
// Drives `gh auth login --web` in a PTY so we can watch for the one-time
// code, auto-press Enter on prompts, and surface progress to the UI.

let activeAuthSession = null;

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function startWebAuth(onEvent) {
  if (!pty) {
    onEvent({ type: "error", error: "node-pty is unavailable; cannot run interactive auth." });
    return { cancel() {} };
  }
  if (activeAuthSession) {
    onEvent({ type: "error", error: "An auth flow is already in progress." });
    return { cancel() {} };
  }

  let bin;
  try { bin = resolveGhBin(); } catch (err) {
    onEvent({ type: "error", error: err.message });
    return { cancel() {} };
  }

  const proc = pty.spawn(
    bin,
    ["auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https", "--skip-ssh-key"],
    {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: process.env.HOME || process.cwd(),
      env: ghEnv(),
    },
  );

  let buffer = "";
  let codeSeen = false;
  let enterSent = false;
  let browserEventSent = false;
  let authenticated = false;
  let finished = false;

  const finish = (event) => {
    if (finished) return;
    finished = true;
    if (activeAuthSession && activeAuthSession.proc === proc) activeAuthSession = null;
    onEvent(event);
  };

  const handleChunk = (raw) => {
    const text = stripAnsi(raw);
    buffer += text;
    // Cap buffer so we don't grow unbounded on long flows.
    if (buffer.length > 32 * 1024) buffer = buffer.slice(-16 * 1024);

    // Extract one-time code once.
    if (!codeSeen) {
      const codeMatch = buffer.match(/one-time code:\s*([A-Z0-9][A-Z0-9-]{3,})/i);
      if (codeMatch) {
        codeSeen = true;
        onEvent({ type: "code", code: codeMatch[1] });
      }
    }

    // Auto-press Enter when gh asks.
    if (!enterSent && /Press Enter to open/i.test(buffer)) {
      enterSent = true;
      try { proc.write("\r"); } catch {}
      if (!browserEventSent) {
        browserEventSent = true;
        onEvent({ type: "browser", url: "https://github.com/login/device" });
      }
    }

    // Respond "y" to any "already logged in" / re-auth confirmation.
    if (/already logged into.*re-authenticate/i.test(buffer) && /\(Y\/n\)/i.test(buffer)) {
      try { proc.write("y\r"); } catch {}
    }

    // Success markers from gh. `Logged in as` is the most reliable one across
    // gh versions; `Authentication complete` is printed just before it.
    if (!authenticated) {
      const userMatch =
        buffer.match(/Logged in as ([^\s*!]+)/i) ||
        buffer.match(/✓ Logged in as ([^\s*!]+)/i);
      if (userMatch) {
        authenticated = true;
        finish({ type: "success", user: userMatch[1] });
      }
    }
  };

  proc.onData(handleChunk);
  proc.onExit(({ exitCode }) => {
    if (finished) return;
    if (exitCode === 0 && authenticated) {
      // Already handled by the success marker above.
      return;
    }
    if (exitCode === 0) {
      // Flow completed but we never saw the username — treat as success and
      // let the caller re-query auth status to pick up the user.
      finish({ type: "success", user: null });
    } else {
      finish({
        type: "error",
        error: `gh auth login exited with code ${exitCode}`,
        output: buffer.trim().slice(-500),
      });
    }
  });

  const session = {
    proc,
    cancel() {
      if (finished) return;
      try { proc.kill(); } catch {}
      finish({ type: "cancelled" });
    },
  };
  activeAuthSession = session;
  return session;
}

function cancelWebAuth() {
  if (activeAuthSession) activeAuthSession.cancel();
}

async function logout() {
  // `gh auth logout -h github.com` doesn't prompt when an account is
  // unambiguous. Swallow the "not logged in" case so repeated clicks are safe.
  try {
    await gh(["auth", "logout", "--hostname", "github.com"]);
    return { ok: true };
  } catch (err) {
    if (/not logged in/i.test(err.message || "")) return { ok: true };
    return { ok: false, error: err.message };
  }
}

async function listUserRepos(limit = 100) {
  // Fetch personal repos
  const personalRaw = await gh([
    "repo", "list",
    "--json", "nameWithOwner,description",
    "--limit", String(limit),
  ]);
  const personal = JSON.parse(personalRaw);

  // Fetch org repos
  let orgRepos = [];
  try {
    const orgsRaw = await gh(["api", "/user/orgs", "--jq", ".[].login"]);
    const orgs = orgsRaw.split("\n").filter(Boolean);
    const orgResults = await Promise.all(
      orgs.map(async (org) => {
        try {
          const raw = await gh([
            "repo", "list", org,
            "--json", "nameWithOwner,description",
            "--limit", String(limit),
          ]);
          return JSON.parse(raw);
        } catch { return []; }
      })
    );
    orgRepos = orgResults.flat();
  } catch { /* no orgs or no access */ }

  // Deduplicate by nameWithOwner
  const seen = new Set();
  const all = [];
  for (const r of [...personal, ...orgRepos]) {
    if (!seen.has(r.nameWithOwner)) {
      seen.add(r.nameWithOwner);
      all.push(r);
    }
  }
  return all;
}

async function listIssues(repo, state = "open") {
  const raw = await gh([
    "api", `/repos/${repo}/issues?state=${state}&per_page=100`,
  ]);
  const items = JSON.parse(raw);
  // Filter out pull requests (GitHub returns PRs in the issues endpoint)
  return items.filter((item) => !item.pull_request);
}

async function listPRs(repo, state = "open") {
  const raw = await gh([
    "api", `/repos/${repo}/pulls?state=${state}&per_page=100`,
  ]);
  return JSON.parse(raw);
}

async function getIssue(repo, number) {
  const raw = await gh(["api", `/repos/${repo}/issues/${number}`]);
  return JSON.parse(raw);
}

async function getPR(repo, number) {
  const raw = await gh(["api", `/repos/${repo}/pulls/${number}`]);
  return JSON.parse(raw);
}

async function listComments(repo, number) {
  const raw = await gh(["api", `/repos/${repo}/issues/${number}/comments`]);
  return JSON.parse(raw);
}

async function addComment(repo, number, body) {
  const raw = await gh([
    "api", `/repos/${repo}/issues/${number}/comments`,
    "-f", `body=${body}`,
  ]);
  return JSON.parse(raw);
}

async function listCollaborators(repo) {
  const raw = await gh(["api", `/repos/${repo}/collaborators`]);
  return JSON.parse(raw);
}

async function assignIssue(repo, number, assignees) {
  const args = ["api", `/repos/${repo}/issues/${number}`, "-X", "PATCH"];
  for (const user of assignees) {
    args.push("-f", `assignees[]=${user}`);
  }
  const raw = await gh(args);
  return JSON.parse(raw);
}

async function unassignIssue(repo, number, assignees) {
  const raw = await ghWithStdin(
    ["api", `/repos/${repo}/issues/${number}/assignees`, "-X", "DELETE", "--input", "-"],
    { assignees },
  );
  return JSON.parse(raw);
}

async function checkoutPR(repo, prNumber) {
  // Use gh pr checkout which handles fetching the branch
  const [owner, name] = repo.split("/");
  await gh(["pr", "checkout", String(prNumber), "-R", repo]);
  return { success: true };
}

async function closeIssue(repo, number) {
  const raw = await gh(["api", `/repos/${repo}/issues/${number}`, "-X", "PATCH", "-f", "state=closed"]);
  return JSON.parse(raw);
}

async function mergePR(repo, number) {
  const raw = await gh(["api", `/repos/${repo}/pulls/${number}/merge`, "-X", "PUT"]);
  return JSON.parse(raw);
}

async function reopenIssue(repo, number) {
  const raw = await gh(["api", `/repos/${repo}/issues/${number}`, "-X", "PATCH", "-f", "state=open"]);
  return JSON.parse(raw);
}

async function createIssue(repo, title, body) {
  const raw = await ghWithStdin(
    ["api", `/repos/${repo}/issues`, "--input", "-"],
    { title, body: body || "" },
  );
  return JSON.parse(raw);
}

async function createPR(repo, title, body, head, base) {
  const raw = await ghWithRawStdin([
    "pr", "create",
    "-R", repo,
    "--title", title,
    "--head", head,
    "--base", base || "main",
    "--body-file", "-",
  ], body || "");
  // gh pr create outputs the PR URL, not JSON
  return { url: raw };
}

async function listBranches(repo) {
  const raw = await gh(["api", `/repos/${repo}/branches?per_page=100`]);
  return JSON.parse(raw);
}

async function getCurrentBranch() {
  try {
    const raw = await new Promise((resolve, reject) => {
      execFile("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        env: { ...process.env, PATH: buildSpawnPath() },
        timeout: 5000,
      }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout.trim());
      });
    });
    return raw;
  } catch {
    return null;
  }
}

async function getRepoDefaultBranch(repo) {
  try {
    const raw = await gh(["api", `/repos/${repo}`, "--jq", ".default_branch"]);
    return raw || "main";
  } catch {
    return "main";
  }
}

async function uploadImage(_repo, _base64Data, _filename) {
  throw new Error("GitHub image upload is not implemented. Remove pasted images or paste a GitHub-hosted image URL instead.");
}

async function getLinkedPRs(repo, issueNumber) {
  const raw = await gh([
    "api", `/repos/${repo}/issues/${issueNumber}/timeline`,
    "-H", "Accept: application/vnd.github.mockingbird-preview+json",
    "--paginate",
  ]);
  const events = JSON.parse(raw);
  const prs = [];
  const seen = new Set();
  for (const ev of events) {
    if (ev.event === "cross-referenced" && ev.source?.issue?.pull_request) {
      const pr = ev.source.issue;
      if (!seen.has(pr.number)) {
        seen.add(pr.number);
        prs.push({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          html_url: pr.html_url,
        });
      }
    }
  }
  return prs;
}

module.exports = {
  checkAuth,
  startWebAuth,
  cancelWebAuth,
  logout,
  listUserRepos,
  listIssues,
  listPRs,
  getIssue,
  getPR,
  listComments,
  addComment,
  listCollaborators,
  assignIssue,
  unassignIssue,
  checkoutPR,
  closeIssue,
  mergePR,
  reopenIssue,
  createIssue,
  createPR,
  listBranches,
  getCurrentBranch,
  getRepoDefaultBranch,
  uploadImage,
  getLinkedPRs,
};
