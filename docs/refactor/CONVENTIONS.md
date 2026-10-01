# TypeScript conventions

The strict-TypeScript migration is complete: every source file in `src/`,
`electron/`, `shared/` and `scripts/`, plus the tool configs
(`vite.config.ts`, `eslint.config.ts`, `electron-builder.config.ts`), is
TypeScript, and `allowJs` is off. The rules below started as migration
guidelines and are now permanent repo conventions.

Every change must pass `npm run typecheck`, `npm run lint` (the whole repo,
zero errors and zero warnings), `npm test` and `npm run build`. CI runs all
four.

## Hard rules

- No `any`, `as any`, or `@ts-ignore`, and no file-wide type-check opt-outs. `@ts-expect-error` only
  with a description, and only for genuine upstream typing bugs.
- No new JavaScript files. `as unknown as` and `eslint-disable` need a
  comment saying why.
- Every IPC boundary goes through `shared/ipc/contract.ts`. Don't hand-write
  channel names or payload shapes anywhere else. To add or change a channel, edit
  the contract first, then the preload, then the handler.
- Use `unknown` plus a type guard for anything parsed from JSON, CLI output,
  disk, or the network. Put reusable guards next to the type.
- `shared/` is runtime-agnostic: no DOM, no Node, no Electron imports.
- Use ES module `import`/`export` everywhere. No `require`/`module.exports` in
  `.ts` files. In Electron code, import Node built-ins as `node:fs`, `node:path`,
  and so on.
- Import specifiers are extensionless (`./foo`, not `./foo.ts`). Use the
  `@shared/...` alias for shared code. Exception: `scripts/` run directly on
  Node's type stripping and import each other with explicit `.ts` extensions.
- Refactors don't change runtime behavior. List every behavior change (bug
  fixes included) in the PR description.

## Splitting & decoupling

- Aim for files under ~400 lines. A file over 600 lines needs a reason.
- When splitting a module, keep its file path as the **public entry** and put
  the extracted pieces in a sibling folder, for example
  `src/components/settings/AppearanceSection.tsx` or `electron/ipc/git.ts`.
- Separate concerns:
  - pure logic (parsers, reducers, formatters) goes into `*.ts` modules with no React and no Electron
  - side effects go into hooks or services
  - components only render and wire events
- Prefer a typed props interface (`interface FooProps`) per component, and
  `useCallback`/`useMemo` only where they already existed or fix a real re-render.
- Prefer discriminated unions with exhaustive `switch` statements (a `never`
  check at the end) over stringly-typed `if` chains.

## Shared types

If a type in `shared/` is wrong or missing, fix it in `shared/` rather than
working around it locally. Prefer additive changes (optional fields, new
types); a rename touches every runtime, so call it out in the PR.

## PR checklist

1. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
2. No `any` (`grep -nE "\bany\b"`), no unexplained `as unknown as` or
   `eslint-disable`.
3. The description lists any splits made, any behavior changes, and any
   change to `shared/` types or the IPC contract.
