# RayLine click responsiveness — follow-up 2026-09-30

The September 27 local investigation found multi-megabyte tool output in saved conversations, expensive tool formatting, and synchronous state writes. Those uncommitted changes were reviewed before packaging.

## Final implementation

- Tool output is serialized once when expanded and revealed incrementally (2,400 characters initially, then 19,200 per click). Redaction runs on the visible portion. The complete value remains available.
- Command previews bound their input before regular-expression processing.
- Foreground Aurora animation is capped at 24 fps.
- Main-process saves use compact JSON, asynchronous temporary-file writes and atomic replacement. A revision guard prevents a pending write from overwriting the final synchronous close-time snapshot. Project-manager saves use the same store.
- Conversation text and tool values are preserved in full. The experimental September 27 persistence truncation was not included in the release because it could destroy content unavailable from a CLI session.

## Validation

`npm run test:state-store` covers rapid saves, large-content round trips, a close-time write racing an in-flight save, and recovery after a disk-write error. `npm run test:ui-regressions` retains the eight model/draft/streaming regressions. Packaged-app observations are recorded separately in the release verification report.
