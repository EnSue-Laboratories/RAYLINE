const { execFile, spawn } = require("child_process");
const { buildSpawnPath, isExecutable, resolveCliBin } = require("./cli-bin-resolver.cjs");

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
    await gh(["auth", "status"]);
    return { ok: true };
  } catch (err) {
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
