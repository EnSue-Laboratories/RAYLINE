import { describe, expect, it } from "vitest";
import { buildMulticaAttachmentPrompt, contentTypeForPath, guessExtension, normalizeAttachmentFilename, parseDataUrl } from "../attachments";
import { buildMultipartBody } from "../rest";
import { exitCodeForTerminal, parseMulticaWsMessage, routeMulticaMessage, toMulticaStreamEvent } from "../ws-messages";

describe("WS frames", () => {
  it("parses frames and keeps payloads verbatim", () => {
    expect(parseMulticaWsMessage('{"type":"auth_ack"}')).toEqual({ type: "auth_ack" });
    expect(parseMulticaWsMessage('{"error":"bad token"}')).toEqual({ type: "", error: "bad token" });
    expect(parseMulticaWsMessage("nope")).toBeNull();
    const msg = parseMulticaWsMessage('{"type":"task:message","payload":{"chat_session_id":"s1","task_id":"t1","type":"text","content":"hi"}}');
    expect(msg?.payload).toEqual({ chat_session_id: "s1", task_id: "t1", type: "text", content: "hi" });
    expect(parseMulticaWsMessage('{"type":"x","payload":{"task_id":5}}')).toEqual({ type: "x" });
  });

  it("routes by session, adopts tasks and recognises terminal events", () => {
    const target = { sessionId: "s1", taskId: null };
    expect(routeMulticaMessage({ type: "chat:message", payload: { chat_session_id: "s1", task_id: "t1" } }, target)).toEqual({
      deliver: true,
      adoptTaskId: "t1",
      clearsTask: false,
      terminal: null,
    });
    expect(routeMulticaMessage({ type: "task:message", payload: { task_id: "t1" } }, { sessionId: "s1", taskId: "t1" }).deliver).toBe(true);
    expect(routeMulticaMessage({ type: "task:message", payload: { task_id: "t2" } }, { sessionId: "s1", taskId: "t1" }).deliver).toBe(false);
    expect(routeMulticaMessage({ type: "agent:status", payload: {} }, target).deliver).toBe(true);
    expect(routeMulticaMessage({ type: "task:failed", payload: { session_id: "s1" } }, target)).toMatchObject({ clearsTask: true, terminal: "task:failed" });
    expect(routeMulticaMessage({ type: "chat:done", payload: { session_id: "s1" } }, target)).toMatchObject({ clearsTask: true, terminal: null });
    expect(routeMulticaMessage({ type: "chat:message" }, { sessionId: "", taskId: null }).deliver).toBe(false);
  });

  it("maps terminal events to exit codes and stream events", () => {
    expect(exitCodeForTerminal("task:completed")).toBe(0);
    expect(exitCodeForTerminal("task:failed")).toBe(1);
    expect(exitCodeForTerminal("task:cancelled")).toBeNull();
    expect(toMulticaStreamEvent({ type: "task:completed" })).toEqual({ type: "multica:task:completed", payload: {} });
  });
});

describe("attachments", () => {
  it("guesses names and content types", () => {
    expect(guessExtension("image/jpeg")).toBe("jpg");
    expect(guessExtension("application/vnd.api+json")).toBe("vnd.api");
    expect(guessExtension("")).toBe("bin");
    expect(contentTypeForPath("/a/B.PNG", "image")).toBe("image/png");
    expect(contentTypeForPath("/a/notes.md", "file")).toBe("text/plain");
    expect(contentTypeForPath("/a/notes.md", "image")).toBe("application/octet-stream");
    expect(normalizeAttachmentFilename(" /x/y.txt ", "file", "text/plain", 0)).toBe("y.txt");
    expect(normalizeAttachmentFilename("", "image", "image/webp", 2)).toBe("image-3.webp");
  });

  it("decodes data URLs", () => {
    expect(parseDataUrl("data:text/plain;base64,aGk=")).toEqual({ contentType: "text/plain", data: Buffer.from("hi") });
    expect(parseDataUrl("data:,a%20b").data.toString()).toBe("a b");
    expect(() => parseDataUrl("http://x")).toThrow("expected a data URL");
  });

  it("builds the attachment prompt block", () => {
    expect(buildMulticaAttachmentPrompt("hello", [])).toBe("hello");
    const block = buildMulticaAttachmentPrompt("hello", [{ kind: "file", id: "att_1", filename: "a.pdf", contentType: "application/pdf", sizeBytes: 12 }]);
    expect(block).toContain("- file: a.pdf (attachment_id: att_1, content_type: application/pdf, size_bytes: 12)");
    expect(block.endsWith("</rayline-multica-attachments>\n\nhello")).toBe(true);
  });

  it("builds a multipart body with a sanitized filename", () => {
    const { body, contentType } = buildMultipartBody({ filename: 'a"b\r\n.txt', contentType: "text/plain", data: Buffer.from("x") }, "BOUND");
    expect(contentType).toBe("multipart/form-data; boundary=BOUND");
    expect(body.toString()).toBe('--BOUND\r\nContent-Disposition: form-data; name="file"; filename="a_b__.txt"\r\nContent-Type: text/plain\r\n\r\nx\r\n--BOUND--\r\n');
  });
});
