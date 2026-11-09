import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const NO_NETWORK = "TabRules makes no network calls.";
const NO_HTML_SINK =
  "Build the DOM with createElement/textContent (Trusted Types is enforced).";

export default defineConfig(
  { ignores: ["dist/", "coverage/"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.e2e.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      "no-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: NO_NETWORK },
        { name: "XMLHttpRequest", message: NO_NETWORK },
        { name: "WebSocket", message: NO_NETWORK },
        { name: "EventSource", message: NO_NETWORK },
      ],
      "no-restricted-properties": [
        "error",
        { object: "navigator", property: "sendBeacon", message: NO_NETWORK },
        { property: "innerHTML", message: NO_HTML_SINK },
        { property: "outerHTML", message: NO_HTML_SINK },
        { property: "insertAdjacentHTML", message: NO_HTML_SINK },
        { object: "document", property: "write", message: NO_HTML_SINK },
        { object: "document", property: "writeln", message: NO_HTML_SINK },
      ],
    },
  },
  {
    files: ["src/**/*.test.ts"],
    rules: { "no-script-url": "off" },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["scripts/render-store-assets.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
);
