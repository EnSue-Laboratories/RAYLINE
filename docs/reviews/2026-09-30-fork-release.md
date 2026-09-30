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
CI=true CSC_IDENTITY_AUTO_DISCOVERY=false RAYLINE_RELEASE_REPOSITORY=vickioo/RAYLINE npx electron-builder --config electron-builder.config.cjs --mac dmg --arm64 --publish never
```

## Validation status

Source regression tests (8), persistence tests (3), theme-token verification and changed-file ESLint passed. Installed-package testing and local handoff evidence will be appended after the package is built and inspected.
