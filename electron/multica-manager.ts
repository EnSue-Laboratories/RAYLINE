/**
 * Multica remote-agent provider — public entry used by electron/main.
 *
 * One WebSocket per (server, workspace) is shared across every conversation
 * bound to that workspace; REST helpers cover auth, workspace discovery,
 * agents, chat sessions and messages.
 *
 *  - providers/multica/rest.ts         REST transport (+ multipart upload)
 *  - providers/multica/api.ts          typed endpoints
 *  - providers/multica/attachments.ts  attachment upload + prompt block
 *  - providers/multica/ws-messages.ts  pure WS frame parsing / routing
 *  - providers/multica/ws-pool.ts      socket pool, subscriptions, cancel
 *  - providers/multica/session.ts      start / cancel / subscribe
 */

export { cancelMulticaAgent, startMulticaAgent, subscribeMulticaAgent } from "./providers/multica/session";
export {
  multicaEnsureSession,
  multicaListAgents,
  multicaListMessages,
  multicaListWorkspaces,
  multicaSendCode,
  multicaSendMessage,
  multicaVerifyCode,
} from "./providers/multica/api";
