# RayLine 0.1.9 fork release — 2026-09-30

## Scope and provenance

This release builds on UI/model consolidation commit `73d967d` and upstream main `8cd0039` (verified on September 30, 2026). It includes the integrated Grok, model search, locale/theme, navigation and draft fixes, plus the reviewed responsiveness and lossless state-saving changes.

The release target is `vickioo/RAYLINE`. `RAYLINE_RELEASE_REPOSITORY` selects the build's publishing/update repository; CI defaults to `GITHUB_REPOSITORY`, and local builds otherwise retain the upstream default. Packaged metadata records the source commit and repository, visible in Settings on macOS as well as Windows.

`RAYLINE_USER_DATA_DIR` selects an isolated profile for packaged verification. Normal launches continue using the existing RayLine profile. The macOS package is locally/ad-hoc signed, not Developer ID notarized. Automatic macOS updates remain unsupported by the existing updater; this release is installed directly.

## Reproduction

```sh
npm ci
npm run test:ui-regressions
npm run test:state-store
npm run verify:theme-tokens
npm run build
CI=true CSC_IDENTITY_AUTO_DISCOVERY=false RAYLINE_RELEASE_REPOSITORY=vickioo/RAYLINE npx electron-builder --config electron-builder.config.cjs --config.electronDist=node_modules/electron/dist --config.mac.identity=- --mac --dir --arm64 --publish never
mkdir -p release/dmg-local
ditto release/mac-arm64/RayLine.app release/dmg-local/RayLine.app
ln -sfn /Applications release/dmg-local/Applications
hdiutil create -volname "RayLine 0.1.9" -srcfolder release/dmg-local -ov -format UDZO release/RayLine-0.1.9-arm64.dmg
```

## Validation status

Source regression tests (8), persistence tests (3), theme-token verification and changed-file ESLint passed. The shipped application is built from `5663a33edd26d28e63b020531713c8cd17c5e2c0`.

Packaged Electron / Playwright checks used real IPC and isolated profiles:

- Type `grok47`, filter to Grok 4.7, and select with Enter.
- Conversation draft survives Settings, reload and switching conversations.
- Project-row new chat preselects the project; Escape closes the model menu without cancelling the form; Back/reopen restores the new-chat draft.
- Chinese/light and English/dark settings screenshots inspected, including version, commit and fork identity.
- A 1,080,000-character tool result expands incrementally in 102 ms in the observed run. Persisted content compares exactly to the fixture.
- The packaged native node-pty module creates a real shell, accepts input and returns its output.
- No renderer page errors observed during these checks.
- `/Applications/RayLine.app` launches successfully. A private copy of the existing six-conversation profile loads; four visible conversations were switched, with the slowest observed click taking 966 ms. No private content is included in this report or release assets.
- A minimal Finder-style environment (`PATH=/usr/bin:/bin:/usr/sbin:/sbin`) starts the installed app and discovers the installed Claude, Codex and Grok CLIs. No inherited developer-shell PATH is needed.
- A second packaged launch exits normally and focuses the existing responsive process.
- Two development-origin draft keys and the theme setting were migrated into a separate file-origin test profile and read successfully by the installed app.
- `codesign --verify --deep --strict` passes on the built, installed and DMG-contained application. `hdiutil verify` passes. The installed and DMG-contained `app.asar` hashes match.

Artifact: `RayLine-0.1.9-arm64.dmg` (183,443,632 bytes).
SHA-256: `b4ccf5e730d361a89ce6280eda303c4400cf069ccd2920ab4b91bdbfb7e624ea`.

The package was built with the installed Electron 41.2.0 distribution and the system `hdiutil`, after GitHub binary downloads failed. It has an ad-hoc signature and is not Apple-notarized. This validation covers Apple Silicon macOS; paid provider requests, Windows/Linux packages and live SSH runs are outside this release verification.

## Local handoff

The previous application and a pre-release state snapshot are retained locally. The desktop `RayLine.app` shortcut and legacy `RayLine Dev.command` both point at `/Applications/RayLine.app`; neither starts Vite. The final transition waits for the agent running this conversation to finish before closing the development app, migrating composer drafts/theme and opening the installed application. This avoids interrupting the delivery conversation or having development and packaged applications write the same profile simultaneously. Local handoff receipts and private backups stay outside the repository.

## Published delivery

- Fork release: https://github.com/vickioo/RAYLINE/releases/tag/v0.1.9
- Upstream integration request: https://github.com/EnSue-Laboratories/RAYLINE/pull/230
- GitHub reports the uploaded DMG digest as the same SHA-256 recorded above.
- The fork packaging workflow was paused for the publication event and restored immediately afterwards, preventing a second CI build from replacing the locally verified assets.
