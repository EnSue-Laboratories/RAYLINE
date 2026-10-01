/**
 * Transitional adapter for the public provider entries: electron/main still
 * passes `event.sender` (WebContents) until electron-shell switches it to
 * `webContentsSink(event.sender)`. Providers themselves only see an
 * `AgentEventSink`.
 *
 * TODO(ts-boundary): accept only AgentEventSink once electron-shell lands.
 */

import type { WebContents } from "electron";
import { webContentsSink, type AgentEventSink } from "../../agent-sink";

export type AgentEventTarget = AgentEventSink | WebContents;

export function toAgentEventSink(target: AgentEventTarget): AgentEventSink {
  return "stream" in target ? target : webContentsSink(target);
}

/** Wraps a `(request, sink)` provider entry so it also accepts a WebContents. */
export function acceptingEventTarget<Req, Ret>(start: (request: Req, sink: AgentEventSink) => Ret): (request: Req, target: AgentEventTarget) => Ret {
  return (request, target) => start(request, toAgentEventSink(target));
}
