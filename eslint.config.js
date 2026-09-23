import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-e2e/**",
      "**/.astro/**",
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "release/**",
      "tmp/**",
      "tests/fixtures/pages/**",
      "apps/website/**/*.astro",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, chrome: "readonly" } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Draft text must never be rendered as HTML (PRD §4.4).
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "Render draft values as text, never HTML." },
        { selector: "CallExpression[callee.name='eval']", message: "No eval." },
        { selector: "NewExpression[callee.name='Function']", message: "No Function constructor." },
      ],
    },
  },
  {
    // The extension must not make network requests (PRD §4.1).
    files: ["apps/extension/src/**/*.{ts,tsx}", "packages/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", "fetch", "XMLHttpRequest", "WebSocket", "EventSource"],
      "no-restricted-properties": ["error", { object: "navigator", property: "sendBeacon" }],
    },
  },
);
