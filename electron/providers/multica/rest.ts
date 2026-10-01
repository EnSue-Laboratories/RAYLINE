/**
 * Multica REST transport. Errors keep the historical message format the
 * renderer surfaces: `multica <METHOD> <path> <status>: <body>`.
 */

import crypto from "node:crypto";

const REQUEST_TIMEOUT_MS = 15_000;

export class MulticaHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "MulticaHttpError";
  }
}

/** HTTP status of a Multica REST failure, if any. */
export function httpStatusOf(err: unknown): number | null {
  return err instanceof MulticaHttpError ? err.status : null;
}

export interface MulticaAuth {
  serverUrl: string;
  token?: string;
  workspaceId?: string;
  workspaceSlug?: string;
}

export interface MulticaUpload {
  filename: string;
  contentType: string;
  data: Buffer;
}

interface RequestSpec extends MulticaAuth {
  method: "GET" | "POST";
  path: string;
  /** JSON body. */
  body?: unknown;
  /** Multipart `file` field (instead of `body`). */
  file?: MulticaUpload;
}

function authHeaders({ token, workspaceId, workspaceSlug }: MulticaAuth): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (workspaceId) headers["X-Workspace-ID"] = workspaceId;
  if (workspaceSlug) headers["X-Workspace-Slug"] = workspaceSlug;
  return headers;
}

/** `multipart/form-data` body with a single `file` part. */
export function buildMultipartBody(file: MulticaUpload, boundary = `----rayline-multica-${crypto.randomUUID()}`): { body: Buffer; contentType: string } {
  const safeFilename = String(file.filename || "attachment").replace(/[\r\n"]/g, "_").slice(0, 240) || "attachment";
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename}"\r\nContent-Type: ${file.contentType || "application/octet-stream"}\r\n\r\n`,
    "utf8",
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { body: Buffer.concat([preamble, file.data, epilogue]), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Performs a request; resolves parsed JSON (or text), null for empty bodies. */
export async function multicaRequest(spec: RequestSpec): Promise<unknown> {
  const { method, path } = spec;
  const headers = authHeaders(spec);
  let payload: Buffer | undefined;
  if (spec.file) {
    const multipart = buildMultipartBody(spec.file);
    payload = multipart.body;
    headers["Content-Type"] = multipart.contentType;
  } else {
    headers["Content-Type"] = "application/json";
    if (spec.body !== undefined && spec.body !== null) payload = Buffer.from(JSON.stringify(spec.body));
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, spec.serverUrl), {
      method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new Error(`multica ${method} ${path} timed out after 15s`);
    }
    throw err;
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    if ((response.headers.get("content-type") || "").startsWith("application/json")) {
      try {
        data = JSON.parse(text) as unknown;
      } catch (err) {
        throw new Error(`multica ${method} ${path}: invalid JSON response: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      data = text;
    }
  }
  if (response.status >= 400) {
    throw new MulticaHttpError(`multica ${method} ${path} ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`, response.status, data);
  }
  return data;
}
