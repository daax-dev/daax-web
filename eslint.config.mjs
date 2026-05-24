import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees are separate working directories, not part of this codebase
    ".worktrees/**",
  ]),
  // Custom rule overrides for TypeScript
  {
    rules: {
      // Allow unused vars prefixed with underscore
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Downgrade no-explicit-any to warning (legacy code migration in progress)
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // SSR/hydration patterns - scoped to specific directories where these patterns are required
  {
    files: [
      "app/**/*.tsx",
      "components/**/*.tsx",
      "hooks/**/*.ts",
      "lib/**/*.ts",
      "lib/**/*.tsx",
      "plugins/**/*.ts",
      "plugins/**/*.tsx",
    ],
    rules: {
      // Allow setState in useEffect for hydration handling - common SSR pattern
      // Required for: client-side state initialization after server render
      "react-hooks/set-state-in-effect": "off",
      // Allow impure functions (like Date.now()) in render for display formatting
      // Required for: dynamic timestamps, randomization in UI
      "react-hooks/purity": "off",
      // Allow accessing refs during render (common pattern for callback refs)
      // Required for: imperative DOM operations, third-party library integration
      "react-hooks/refs": "off",
      // React Compiler diagnostics: legacy code migration in progress, matching
      // the existing policy above. Mutual-recursion / use-before-declaration of
      // useCallback consts and manual memoization patterns are flagged but are
      // not runtime defects in these effect/callback handlers.
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);

export default eslintConfig;
