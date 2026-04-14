const { execFile, spawn } = require("child_process");

function log(...args) {
  console.log("[github-manager]", ...args);
}

/**
 * Execute a gh CLI command and return stdout.
 */
function gh(args) {
  return new Promise((resolve, reject) => {
    execFile("gh", args, {
      env: { ...process.env, GH_NO_UPDATE_NOTIFIER: "1" },
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
    const child = spawn("gh", args, {
      env: { ...process.env, GH_NO_UPDATE_NOTIFIER: "1" },
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

async function checkAuth() {
  try {
    await gh(["auth", "status"]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function listUserRepos(limit = 100) {
  const raw = await gh([
    "repo", "list",
    "--json", "nameWithOwner,description",
    "--limit", String(limit),
  ]);
  return JSON.parse(raw);
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
};
