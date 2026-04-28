import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const EXT_RE = /\.(css|jsx?|tsx?)$/;
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (EXT_RE.test(entry.name)) files.push(full);
  }
  return files;
}

const files = walk(SRC);
const refs = new Map();
const defs = new Map();

function add(map, key, file) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(path.relative(ROOT, file));
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
    add(refs, match[1], file);
  }
  for (const match of source.matchAll(/(^|[\s;{])(--[A-Za-z0-9_-]+)\s*:/g)) {
    add(defs, match[2], file);
  }
  for (const match of source.matchAll(/setProperty\(\s*["'](--[A-Za-z0-9_-]+)["']/g)) {
    add(defs, match[1], file);
  }
  for (const match of source.matchAll(/["'](--[A-Za-z0-9_-]+)["']\s*:/g)) {
    add(defs, match[1], file);
  }
}

const missing = [...refs.keys()].filter((name) => !defs.has(name)).sort();
if (missing.length) {
  console.error(`Missing theme token definitions: ${missing.length}`);
  for (const token of missing) {
    console.error(`${token} :: ${[...refs.get(token)].slice(0, 8).join(", ")}`);
  }
  process.exit(1);
}

console.log(`Theme token verification passed (${refs.size} referenced tokens).`);
