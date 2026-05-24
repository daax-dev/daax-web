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
    files: ["app/**/*.tsx", "components/**/*.tsx", "hooks/**/*.ts", "lib/**/*.ts", "lib/**/*.tsx"],
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
    },
  },
  // Plugins/legacy tree only: additionally suppress the stricter React Compiler
  // diagnostics. These flag use-before-declaration of mutually-recursive
  // useCallback consts and manual-memoization patterns. They are NOT disabled
  // for app/components/hooks/lib, where such diagnostics must be fixed in code.
  {
    files: ["plugins/**/*.ts", "plugins/**/*.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);

export default eslintConfig;
