import { describe, expect, it } from "vitest";
import type { HostnameRule } from "./rule.js";
import {
  MAX_RULES_FILE_BYTES,
  parseRulesFile,
  serializeRulesFile,
} from "./rules-file.js";

const rules: HostnameRule[] = [
  {
    id: "gh",
    type: "hostname",
    pattern: "github.com",
    groupTitle: "GitHub",
    color: "blue",
    enabled: true,
  },
  { id: "all", type: "hostname", pattern: "*", enabled: false },
];

describe("rules file", () => {
  it("round-trips rules through export and import", () => {
    expect(parseRulesFile(serializeRulesFile(rules))).toEqual({
      ok: true,
      rules,
    });
  });

  it("writes a versioned, human-readable file", () => {
    const text = serializeRulesFile([]);

    expect(text).toBe(
      '{\n  "format": "tabrules",\n  "version": 1,\n  "rules": []\n}\n',
    );
  });

  it("rejects text that is not JSON", () => {
    expect(parseRulesFile("{oops")).toEqual({
      ok: false,
      errors: ["The file is not valid JSON."],
    });
  });

  it.each([
    "[]",
    "null",
    '{"format":"other","version":1,"rules":[]}',
    '{"format":"tabrules","version":2,"rules":[]}',
  ])("rejects a file that is not a TabRules export: %s", (text) => {
    expect(parseRulesFile(text)).toEqual({
      ok: false,
      errors: ["The file is not a TabRules export (format version 1)."],
    });
  });

  it("validates the rules it contains", () => {
    const result = parseRulesFile(
      '{"format":"tabrules","version":1,"rules":[{"id":"x"}]}',
    );

    expect(result.ok).toBe(false);
  });

  it("rejects files above the size limit before parsing", () => {
    expect(parseRulesFile(" ".repeat(MAX_RULES_FILE_BYTES + 1))).toEqual({
      ok: false,
      errors: ["The file is too large."],
    });
  });
});
