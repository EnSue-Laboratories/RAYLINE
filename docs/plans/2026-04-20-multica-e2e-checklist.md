# Multica E2E manual test — 2026-04-20

- [ ] Fresh install (clear localStorage multica.v1) → model picker shows `MULTICA → Connect Multica…`.
- [ ] Complete setup against `https://srv1309901.tail96f1f.ts.net` with `dev@localhost` + `888888`.
- [ ] Picker now lists agents with status tags.
- [ ] New chat:
  - Pick Multica agent `Claude`
  - Toggle Tree (worktree) on
  - Enter short prompt
  - Confirm → branch is pushed (verify with `git branch -r | grep <name>`)
  - `task:message(text)` streams into the assistant bubble
  - `chat:done` flips `isStreaming` off
- [ ] Three parallel chats on mac/linux/win agents each get their own branch and worktree.
- [ ] Switching the model in the picker to Claude Opus (mid-chat) cancels any running Multica task and drives the tab with Claude on the same worktree.
- [ ] Multica's pushed commits appear as ↑N in `GitStatusPill`; pull works.
- [ ] After quit/relaunch, previously-created Multica conversations reload and show a Reconnect pill if they had unfinished tasks.
- [ ] 401 surfaces as "Session expired — reconnect."
