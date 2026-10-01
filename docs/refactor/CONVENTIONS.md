# TypeScript migration conventions

The `refactor/typescript` branch is the integration branch. Every source file
already has its final extension (`.ts` / `.tsx`) and starts with
`// @ts-nocheck`. A file is **converted** when that header is gone and the file
passes `npm run typecheck` and `npm run lint:ts` with zero errors and zero warnings.

Progress: `npm run ts:progress`.

## Hard rules

- No `any`, `as any`, `@ts-ignore`, or new `@ts-nocheck`. `@ts-expect-error` only
  with a description, and only for genuine upstream typing bugs.
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
  `@shared/...` alias for shared code.
- Don't change runtime behavior unless you're fixing a clear bug, and list every
  behavior change in your PR description.

## Splitting & decoupling

- Aim for files under ~400 lines. A file over 600 lines needs a reason.
- Keep the original file path as the module's **public entry**. Other packages
  import it, and moving entries happens in a later pass. Put extracted pieces in
  a sibling folder you own, for example
  `src/components/settings/AppearanceSection.tsx` or
  `electron/ipc/git.ts`.
- Separate concerns:
  - pure logic (parsers, reducers, formatters) goes into `*.ts` modules with no React and no Electron
  - side effects go into hooks or services
  - components only render and wire events
- Prefer a typed props interface (`interface FooProps`) per component, and
  `useCallback`/`useMemo` only where they already existed or fix a real re-render.
- Prefer discriminated unions with exhaustive `switch` statements (a `never`
  check at the end) over stringly-typed `if` chains.

## Ownership

You own only the files listed in your work package. If you must touch a file
you don't own (for example, a one-line import fix), keep it minimal and call it
out in the PR. Never convert or reformat files outside your package.

If a shared type in `shared/` is wrong or missing, fix it in `shared/` with a
minimal additive change: add optional fields or new types, and don't rename
existing ones. Mention it in the PR.

## Done checklist (per PR)

1. `npm run typecheck`, `npm run lint:ts`, and `npm run build` all pass.
2. None of your files contains `@ts-nocheck`, and none contains `any`
   (`grep -nE "\bany\b"`).
3. The PR targets `refactor/typescript`. The description lists the files
   converted, the splits made, any behavior changes, and any edits outside your
   ownership.
