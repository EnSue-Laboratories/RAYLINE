export const CONVOS_INIT = [
  {
    id: "1",
    title: "Refactoring the orchestration layer",
    model: "claude-opus",
    ts: "2m",
    msgs: [
      {
        id: "a",
        role: "user",
        text: "How should I structure the adapter pattern for multi-model routing in my orchestration layer?",
      },
      {
        id: "b",
        role: "assistant",
        text: "Define a unified interface — something like ModelAdapter with complete(), stream(), and capabilities() methods. Each provider adapter implements this interface, normalizing request/response shapes.\n\nThe key insight: your orchestrator shouldn't know or care which model it's talking to. It expresses intent through the adapter interface, and the adapter handles provider-specific serialization, auth, error handling, and response normalization.\n\nKeep the adapters stateless. Session tracking and conversation history belong in the orchestration layer, not in the adapters themselves.",
      },
      {
        id: "c",
        role: "user",
        text: "What about handling streaming differences across providers?",
      },
      {
        id: "d",
        role: "assistant",
        text: "Each provider streams differently — SSE, WebSocket, chunked JSON — but your adapter can normalize all of them into a single async iterator interface.\n\nDefine a StreamChunk type with fields like delta, metadata, and done. Each adapter's stream() method returns AsyncIterable<StreamChunk> regardless of the underlying transport. The orchestrator consumes a uniform stream.\n\nFor the edge cases: handle backpressure at the adapter level, implement reconnection logic per-provider, and emit structured error chunks rather than throwing mid-stream.",
      },
    ],
  },
  {
    id: "2",
    title: "WhisperKit chunked pipeline",
    model: "claude-sonnet",
    ts: "1h",
    msgs: [
      {
        id: "e",
        role: "user",
        text: "What's the optimal chunk size for local WhisperKit transcription on Apple Silicon?",
      },
      {
        id: "f",
        role: "assistant",
        text: "Chunking at VAD boundaries gives you the best quality-to-latency tradeoff on Apple Silicon. Aim for 25-30 second segments with voice activity detection marking the split points — this avoids cutting mid-word while keeping memory pressure manageable on the Neural Engine.\n\nThe base model handles these chunks in near-realtime on M1+. For the medium model, expect ~0.8x realtime on M2 Pro, which is still acceptable for lecture capture where you're buffering ahead of playback.",
      },
    ],
  },
  {
    id: "3",
    title: "SYNCat protocol design",
    model: "gpt-4o",
    ts: "3h",
    msgs: [
      {
        id: "g",
        role: "user",
        text: "Should SYNCat use CRDTs or an append-only log for multi-agent state sync?",
      },
      {
        id: "h",
        role: "assistant",
        text: "The append-only log is the right primitive here. CRDTs solve a different problem — they're for concurrent human editors who need convergence without coordination. Your agents operate sequentially within a session, and the orchestrator already serializes their turns.\n\nAn append-only log with structured entries gives you full auditability, easy replay, and natural conflict resolution through the challenge/revision mechanic.",
      },
    ],
  },
  {
    id: "4",
    title: "Translation framework on Tahoe",
    model: "claude-sonnet",
    ts: "Yesterday",
    msgs: [
      {
        id: "i",
        role: "user",
        text: "What's the best way to invoke Apple's Translation framework for a floating popover utility?",
      },
      {
        id: "j",
        role: "assistant",
        text: "Create a TranslationSession per language pair, keep it alive for the app's lifecycle to avoid cold-start latency. For a PopClip-style floating button, hook into the accessibility selection notification, grab the selected text, and route it through a pre-warmed session.\n\nThe framework handles model downloading automatically, but you should pre-download common language pairs on first launch.",
      },
    ],
  },
  {
    id: "5",
    title: "CC-Bridge WebSocket architecture",
    model: "claude-opus",
    ts: "2d",
    msgs: [
      {
        id: "k",
        role: "user",
        text: "Walk me through the WebSocket relay design for CC-Bridge.",
      },
      {
        id: "l",
        role: "assistant",
        text: "The relay sits between Claude Code and Codex as a neutral WebSocket server. Each agent connects as a client, authenticates with a session token, and gets assigned a role in the shared workspace.\n\nMessages are typed envelopes — think { type: 'proposal' | 'challenge' | 'revision', payload, sender, seq }. The relay enforces ordering via sequence numbers and broadcasts to all connected agents. No intelligence lives in the relay; it's pure plumbing.",
      },
    ],
  },
];
