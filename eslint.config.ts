// ESLint flat config. ESLint 9 loads `eslint.config.ts` through jiti.
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import type { Linter } from "eslint";
import { defineConfig, globalIgnores } from "eslint/config";

const tsStrictRules: Linter.RulesRecord = {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": "allow-with-description" }],
  "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
  "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
  // Too noisy for UI code that intentionally fires async handlers from events.
  "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
};

export default defineConfig([
  globalIgnores(["dist", "dist-electron", "release", "electron/vendor", "electron/shell-init", ".claude", ".worktrees"]),

  // Renderer
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommendedTypeChecked, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { project: "./tsconfig.renderer.json", tsconfigRootDir: import.meta.dirname },
    },
    rules: tsStrictRules,
  },
  // Main process + shared
  {
    files: ["electron/**/*.ts", "shared/**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: { project: "./tsconfig.electron.json", tsconfigRootDir: import.meta.dirname },
    },
    rules: tsStrictRules,
  },
  // Build scripts and tool configs
  {
    files: ["scripts/**/*.ts", "*.config.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: { project: "./tsconfig.node.json", tsconfigRootDir: import.meta.dirname },
    },
    rules: tsStrictRules,
  },
]);
