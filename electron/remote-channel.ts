/**
 * RayLine SSH channel: an authenticated localhost HTTP server, reverse-
 * forwarded onto the remote SSH host (`ssh -R`), that lets a remote agent
 * upload generated files back to the user's machine. Uploaded files are kept
 * downloadable for two hours after the run finishes.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { errorMessage } from "./providers/common/json";
import {
  ChannelHttpError,
  closeServer,
  contentTypeForName,
  getUploadFilename,
  isAuthorized,
  listen,
  receiveUpload,
  safeChannelFilename,
  safePathSegment,
  sendError,
  sendJson,
} from "./providers/remote/channel-http";

const REMOTE_PORT_MIN = 42000;
const REMOTE_PORT_MAX = 60999;
const DOWNLOAD_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

function readMaxUploadBytes(): number {
  const configured = Number(process.env.RAYLINE_REMOTE_CHANNEL_MAX_UPLOAD_BYTES || DEFAULT_MAX_UPLOAD_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES;
}

const MAX_UPLOAD_BYTES = readMaxUploadBytes();

export interface StartRemoteChannelOptions {
  conversationId?: string;
  provider?: string;
}

export interface RemoteChannelDescription {
  provider: string;
  conversationId: string;
  localPort: number;
  remotePort: number;
  storageDir: string;
  files: number;
}

export interface RemoteChannel {
  readonly provider: string;
  readonly conversationId: string;
  readonly token: string;
  readonly localPort: number;
  readonly remotePort: number;
  readonly localBaseUrl: string;
  readonly remoteBaseUrl: string;
  /** Extra ssh args that set up the reverse forward. */
  readonly sshArgs: readonly string[];
  /** Env vars exported to the remote command. */
  readonly env: Readonly<Record<string, string>>;
  readonly fileCount: number;
  /** Prompt text telling the agent how to use the channel. */
  readonly instructions: string;
  describe(): RemoteChannelDescription;
  /** Stop accepting uploads; keep serving downloads for the TTL. */
  finish(): Promise<void>;
  /** Stop everything now. */
  dispose(): Promise<void>;
}

interface StoredFile {
  id: string;
  name: string;
  path: string;
  bytes: number;
  downloadUrl: string;
  markdown: string;
  createdAt: string;
}

function chooseRemotePort(): number {
  return REMOTE_PORT_MIN + crypto.randomInt(REMOTE_PORT_MAX - REMOTE_PORT_MIN + 1);
}

async function getStorageRoot(): Promise<string> {
  const configured = process.env.RAYLINE_REMOTE_CHANNEL_DIR?.trim() ?? "";
  if (configured) return configured;
  const downloads = path.join(os.homedir(), "Downloads");
  try {
    if ((await fs.promises.stat(downloads)).isDirectory()) return path.join(downloads, "RayLine Remote Files");
  } catch {
    // no Downloads folder
  }
  return path.join(os.tmpdir(), "rayline-remote-files");
}

export function buildRemoteChannelInstructions(remoteBaseUrl: string): string {
  return `RayLine SSH channel:
RayLine opened an authenticated localhost bridge from this remote SSH host back to the user's Mac.
Use it when you need to send generated files, screenshots, archives, or other artifacts back to the user.
- Base URL on this remote host: ${remoteBaseUrl}
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

export async function startRemoteChannel({
  conversationId = "session",
  provider = "agent",
}: StartRemoteChannelOptions = {}): Promise<RemoteChannel> {
  const token = crypto.randomBytes(24).toString("base64url");
  const remotePort = chooseRemotePort();
  const files = new Map<string, StoredFile>();
  const storageDir = path.join(
    await getStorageRoot(),
    `${safePathSegment(provider, "agent")}-${safePathSegment(conversationId, "session")}-${Date.now().toString(36)}`,
  );
  await fs.promises.mkdir(storageDir, { recursive: true, mode: 0o700 });

  let uploadEnabled = true;
  let closed = false;
  let ttlTimer: NodeJS.Timeout | null = null;
  let localBaseUrl = "";

  const handleUpload = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    if (!uploadEnabled) {
      sendError(res, 410, "This RayLine SSH channel is no longer accepting uploads.");
      return;
    }
    const id = crypto.randomBytes(10).toString("hex");
    const name = getUploadFilename(req, url);
    const filePath = path.join(storageDir, `${id}-${safeChannelFilename(name)}`);
    const bytes = await receiveUpload(req, filePath, MAX_UPLOAD_BYTES);
    const downloadUrl = `${localBaseUrl}/download/${id}/${encodeURIComponent(name)}`;
    const entry: StoredFile = {
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
  };

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname.startsWith("/download/")) {
      const entry = files.get(pathname.split("/")[2] ?? "");
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
    } else if (req.method === "GET" && pathname === "/manifest") {
      sendJson(res, 200, {
        ok: true,
        endpoints: { upload: "/upload?name=<filename>", files: "/files", health: "/health" },
        maxUploadBytes: MAX_UPLOAD_BYTES,
      });
    } else if (req.method === "GET" && pathname === "/files") {
      sendJson(res, 200, {
        ok: true,
        files: Array.from(files.values(), (entry) => ({
          id: entry.id,
          name: entry.name,
          bytes: entry.bytes,
          localPath: entry.path,
          downloadUrl: entry.downloadUrl,
          markdown: entry.markdown,
          createdAt: entry.createdAt,
        })),
      });
    } else if (req.method === "POST" && (pathname === "/upload" || pathname === "/files")) {
      await handleUpload(req, res, url);
    } else {
      sendError(res, 404, "Unknown RayLine SSH channel endpoint.");
    }
  };

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err: unknown) => {
      sendError(res, err instanceof ChannelHttpError ? err.statusCode : 500, errorMessage(err));
    });
  });
  server.on("clientError", (_err, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  await listen(server, "127.0.0.1");
  const address = server.address();
  const localPort = typeof address === "object" && address ? address.port : 0;
  localBaseUrl = `http://127.0.0.1:${localPort}`;
  const remoteBaseUrl = `http://127.0.0.1:${remotePort}`;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (ttlTimer) {
      clearTimeout(ttlTimer);
      ttlTimer = null;
    }
    await closeServer(server).catch(() => {});
  };

  return {
    provider,
    conversationId,
    token,
    localPort,
    remotePort,
    localBaseUrl,
    remoteBaseUrl,
    sshArgs: ["-o", "ExitOnForwardFailure=yes", "-R", `127.0.0.1:${remotePort}:127.0.0.1:${localPort}`],
    env: {
      RAYLINE_SSH_CHANNEL_URL: remoteBaseUrl,
      RAYLINE_SSH_CHANNEL_TOKEN: token,
      RAYLINE_SSH_CHANNEL_REMOTE_PORT: String(remotePort),
    },
    get fileCount() {
      return files.size;
    },
    instructions: buildRemoteChannelInstructions(remoteBaseUrl),
    describe: () => ({ provider, conversationId, localPort, remotePort, storageDir, files: files.size }),
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
        ttlTimer.unref();
      }
    },
    async dispose() {
      uploadEnabled = false;
      await close();
    },
  };
}
