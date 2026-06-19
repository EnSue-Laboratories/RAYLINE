"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");

const REMOTE_PORT_MIN = 42000;
const REMOTE_PORT_MAX = 60999;
const DOWNLOAD_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = Number(process.env.RAYLINE_REMOTE_CHANNEL_MAX_UPLOAD_BYTES || 512 * 1024 * 1024);

function safeFilename(value, fallback = "rayline-file") {
  const raw = path.basename(typeof value === "string" && value.trim() ? value.trim() : fallback);
  const cleaned = raw
    .replace(/[^\w.+ -]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned;
}

function safePathSegment(value, fallback) {
  return safeFilename(value, fallback).replace(/\s+/g, "-").replace(/[^A-Za-z0-9_.+-]/g, "_");
}

function chooseRemotePort() {
  const span = REMOTE_PORT_MAX - REMOTE_PORT_MIN + 1;
  return REMOTE_PORT_MIN + crypto.randomInt(span);
}

function getStorageRoot() {
  const configured = typeof process.env.RAYLINE_REMOTE_CHANNEL_DIR === "string"
    ? process.env.RAYLINE_REMOTE_CHANNEL_DIR.trim()
    : "";
  if (configured) return configured;

  const downloads = path.join(os.homedir(), "Downloads");
  try {
    if (fs.existsSync(downloads) && fs.statSync(downloads).isDirectory()) {
      return path.join(downloads, "RayLine Remote Files");
    }
  } catch {}

  return path.join(os.tmpdir(), "rayline-remote-files");
}

function getHeader(req, name) {
  const value = req.headers[String(name).toLowerCase()];
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
}

function isAuthorized(req, url, token) {
  const headerToken = getHeader(req, "x-rayline-token");
  if (headerToken && headerToken === token) return true;

  const auth = getHeader(req, "authorization");
  if (auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim() === token) return true;

  return url.searchParams.get("token") === token;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, error: message });
}

function parseContentDispositionFilename(header) {
  if (!header) return "";
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {}
  }
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const bareMatch = header.match(/filename=([^;]+)/i);
  return bareMatch?.[1]?.trim() || "";
}

function getUploadFilename(req, url) {
  return safeFilename(
    url.searchParams.get("name")
      || getHeader(req, "x-rayline-filename")
      || parseContentDispositionFilename(getHeader(req, "content-disposition")),
    `rayline-file-${Date.now()}`
  );
}

function createByteLimitStream(maxBytes) {
  let bytes = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        const err = new Error(`Upload exceeds ${Math.round(maxBytes / (1024 * 1024))} MB.`);
        err.statusCode = 413;
        callback(err);
        return;
      }
      callback(null, chunk);
    },
  });
  Object.defineProperty(stream, "bytes", { get: () => bytes });
  return stream;
}

async function receiveUpload(req, filePath) {
  const declaredLength = Number(getHeader(req, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    const err = new Error(`Upload exceeds ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
    err.statusCode = 413;
    throw err;
  }

  const limiter = createByteLimitStream(MAX_UPLOAD_BYTES);
  try {
    await pipeline(req, limiter, fs.createWriteStream(filePath, { flags: "wx", mode: 0o600 }));
  } catch (err) {
    await fs.promises.unlink(filePath).catch(() => {});
    throw err;
  }
  return limiter.bytes;
}

function contentTypeForName(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".txt" || ext === ".md" || ext === ".log") return "text/plain; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function buildInstructionText(channel) {
  return `RayLine SSH channel:
RayLine opened an authenticated localhost bridge from this remote SSH host back to the user's Mac.
Use it when you need to send generated files, screenshots, archives, or other artifacts back to the user.
- Base URL on this remote host: ${channel.remoteBaseUrl}
- Auth token env var: $RAYLINE_SSH_CHANNEL_TOKEN

Upload a file and paste the returned markdown link in your reply:
\`\`\`sh
file="/path/to/artifact"
curl -fsS -X POST "$RAYLINE_SSH_CHANNEL_URL/upload?name=$(basename "$file")" \\
  -H "X-RayLine-Token: $RAYLINE_SSH_CHANNEL_TOKEN" \\
  --data-binary @"$file"
\`\`\`

The JSON response includes "markdown", "downloadUrl", and "localPath". Use the markdown value for user-facing download links. Never print the token.`;
}

async function startRemoteChannel({ conversationId = "session", provider = "agent" } = {}) {
  const token = crypto.randomBytes(24).toString("base64url");
  const remotePort = chooseRemotePort();
  const files = new Map();
  const storageDir = path.join(
    getStorageRoot(),
    `${safePathSegment(provider, "agent")}-${safePathSegment(conversationId, "session")}-${Date.now().toString(36)}`
  );
  await fs.promises.mkdir(storageDir, { recursive: true, mode: 0o700 });

  let uploadEnabled = true;
  let closed = false;
  let ttlTimer = null;
  let localBaseUrl = "";

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname;

    try {
      if (req.method === "GET" && pathname.startsWith("/download/")) {
        const [, , id] = pathname.split("/");
        const entry = files.get(id);
        if (!entry) {
          sendError(res, 404, "File not found.");
          return;
        }
        res.writeHead(200, {
          "Content-Type": contentTypeForName(entry.name),
          "Content-Length": entry.bytes,
          "Content-Disposition": `attachment; filename="${entry.name.replace(/"/g, "")}"`,
          "Cache-Control": "private, max-age=3600",
        });
        fs.createReadStream(entry.path).pipe(res);
        return;
      }

      if (!isAuthorized(req, url, token)) {
        sendError(res, 401, "Missing or invalid RayLine SSH channel token.");
        return;
      }

      if (req.method === "GET" && pathname === "/health") {
        sendJson(res, 200, { ok: true, provider, conversationId });
        return;
      }

      if (req.method === "GET" && pathname === "/manifest") {
        sendJson(res, 200, {
          ok: true,
          endpoints: {
            upload: "/upload?name=<filename>",
            files: "/files",
            health: "/health",
          },
          maxUploadBytes: MAX_UPLOAD_BYTES,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/files") {
        sendJson(res, 200, {
          ok: true,
          files: Array.from(files.values()).map((entry) => ({
            id: entry.id,
            name: entry.name,
            bytes: entry.bytes,
            localPath: entry.path,
            downloadUrl: entry.downloadUrl,
            markdown: entry.markdown,
            createdAt: entry.createdAt,
          })),
        });
        return;
      }

      if (req.method === "POST" && (pathname === "/upload" || pathname === "/files")) {
        if (!uploadEnabled) {
          sendError(res, 410, "This RayLine SSH channel is no longer accepting uploads.");
          return;
        }

        const id = crypto.randomBytes(10).toString("hex");
        const name = getUploadFilename(req, url);
        const diskName = `${id}-${safeFilename(name)}`;
        const filePath = path.join(storageDir, diskName);
        const bytes = await receiveUpload(req, filePath);
        const downloadUrl = `${localBaseUrl}/download/${id}/${encodeURIComponent(name)}`;
        const entry = {
          id,
          name,
          path: filePath,
          bytes,
          downloadUrl,
          markdown: `[Download ${name}](${downloadUrl})`,
          createdAt: new Date().toISOString(),
        };
        files.set(id, entry);
        sendJson(res, 201, {
          ok: true,
          id,
          name,
          bytes,
          localPath: filePath,
          downloadUrl,
          markdown: entry.markdown,
          expiresInSeconds: Math.round(DOWNLOAD_TTL_MS / 1000),
        });
        return;
      }

      sendError(res, 404, "Unknown RayLine SSH channel endpoint.");
    } catch (err) {
      sendError(res, err?.statusCode || 500, err?.message || String(err));
    }
  });

  server.on("clientError", (err, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  await listen(server, "127.0.0.1");
  const address = server.address();
  const localPort = typeof address === "object" && address ? address.port : 0;
  localBaseUrl = `http://127.0.0.1:${localPort}`;
  const remoteBaseUrl = `http://127.0.0.1:${remotePort}`;

  const close = async () => {
    if (closed) return;
    closed = true;
    if (ttlTimer) {
      clearTimeout(ttlTimer);
      ttlTimer = null;
    }
    await closeServer(server).catch(() => {});
  };

  const channel = {
    provider,
    conversationId,
    token,
    localPort,
    remotePort,
    localBaseUrl,
    remoteBaseUrl,
    sshArgs: [
      "-o", "ExitOnForwardFailure=yes",
      "-R", `127.0.0.1:${remotePort}:127.0.0.1:${localPort}`,
    ],
    env: {
      RAYLINE_SSH_CHANNEL_URL: remoteBaseUrl,
      RAYLINE_SSH_CHANNEL_TOKEN: token,
      RAYLINE_SSH_CHANNEL_REMOTE_PORT: String(remotePort),
    },
    get fileCount() {
      return files.size;
    },
    instructions: "",
    describe() {
      return {
        provider,
        conversationId,
        localPort,
        remotePort,
        storageDir,
        files: files.size,
      };
    },
    async finish() {
      uploadEnabled = false;
      if (files.size === 0) {
        await close();
        return;
      }
      if (!ttlTimer) {
        ttlTimer = setTimeout(() => {
          close().catch(() => {});
        }, DOWNLOAD_TTL_MS);
        ttlTimer.unref?.();
      }
    },
    async dispose() {
      uploadEnabled = false;
      await close();
    },
  };
  channel.instructions = buildInstructionText(channel);

  return channel;
}

module.exports = {
  startRemoteChannel,
};
