import { describe, expect, it } from "vitest";
import { isValidHostnamePattern, LIMITS, parseRules } from "./validation.js";

const validRule = {
  id: "gh",
  type: "hostname",
  pattern: "github.com",
  groupTitle: "GitHub",
  color: "blue",
  enabled: true,
};

const errorsOf = (input: unknown): string[] => {
  const result = parseRules(input);
  if (result.ok) {
    throw new Error("expected parseRules to fail");
  }
  return result.errors;
};

describe("parseRules", () => {
  it("accepts valid rules, with and without optional fields", () => {
    const minimalRule = {
      id: "all",
      type: "hostname",
      pattern: "*",
      enabled: false,
    };

    expect(parseRules([validRule, minimalRule])).toEqual({
      ok: true,
      rules: [validRule, minimalRule],
    });
  });

  it("accepts an empty list", () => {
    expect(parseRules([])).toEqual({ ok: true, rules: [] });
  });

  it("returns new objects, not the input ones", () => {
    const result = parseRules([validRule]);

    expect(result.ok && result.rules[0]).not.toBe(validRule);
  });

  it.each([null, undefined, {}, "[]", 42])(
    "rejects a non-array input %j",
    (input) => {
      expect(errorsOf(input)).toEqual(["rules: must be an array"]);
    },
  );

  it("rejects more rules than the limit", () => {
    const rules = Array.from({ length: LIMITS.maxRules + 1 }, (_, index) => ({
      ...validRule,
      id: `r${String(index)}`,
      pattern: `site${String(index)}.com`,
    }));

    expect(errorsOf(rules)).toEqual(["rules: at most 500 rules are allowed"]);
  });

  it.each([null, "rule", 1, [validRule], new Date()])(
    "rejects a non-plain-object rule %j",
    (rule) => {
      expect(errorsOf([rule])).toEqual(["rules[0]: must be an object"]);
    },
  );

  it("accepts a rule object without prototype", () => {
    const rule = Object.assign(Object.create(null) as object, validRule);

    expect(parseRules([rule]).ok).toBe(true);
  });

  it("rejects an unknown rule type", () => {
    expect(errorsOf([{ ...validRule, type: "url" }])).toEqual([
      "rules[0].type: unknown rule type",
    ]);
  });

  it("rejects unknown fields, including prototype pollution keys", () => {
    const rule: unknown = JSON.parse('{"__proto__": {"polluted": true}}');
    const errors = errorsOf([
      Object.assign(rule as object, validRule, { extra: 1 }),
    ]);

    expect(errors).toEqual([
      "rules[0].__proto__: unknown field",
      "rules[0].extra: unknown field",
    ]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each([
    undefined,
    1,
    "",
    "a".repeat(LIMITS.maxIdLength + 1),
    "with space",
    "é",
  ])("rejects invalid id %j", (id) => {
    expect(errorsOf([{ ...validRule, id }])).toEqual([
      "rules[0].id: must be 1-64 characters among A-Z a-z 0-9 _ -",
    ]);
  });

  it.each([undefined, 1])("rejects non-string pattern %j", (pattern) => {
    expect(errorsOf([{ ...validRule, pattern }])).toEqual([
      "rules[0].pattern: must be a string",
    ]);
  });

  it.each([
    "",
    "GitHub.com",
    "https://github.com",
    "github.com/path",
    "*.github.com",
  ])("rejects invalid hostname pattern %j", (pattern) => {
    expect(errorsOf([{ ...validRule, pattern }])).toEqual([
      'rules[0].pattern: must be "*" or a lowercase hostname',
    ]);
  });

  it("accepts a regex rule, with a title even when it looks like *", () => {
    const regexRule = {
      id: "google",
      type: "regex",
      pattern: "(^|\\.)google\\.com$",
      groupTitle: "Google",
      enabled: true,
    };

    expect(parseRules([regexRule])).toEqual({ ok: true, rules: [regexRule] });
    expect(
      parseRules([{ ...regexRule, pattern: ".*", groupTitle: "All" }]).ok,
    ).toBe(true);
  });

  it.each([
    ["", "must not be empty"],
    ["a".repeat(254), "must be at most 253 characters"],
    ["(?=a)", "lookarounds and named groups are not supported at position 2"],
    ["Google", "use lowercase letters, hostnames are lowercase at position 1"],
  ])("rejects invalid regex pattern %j", (pattern, error) => {
    expect(
      errorsOf([{ id: "r", type: "regex", pattern, enabled: true }]),
    ).toEqual([`rules[0].pattern: ${error}`]);
  });

  it("accepts an empty group title, for an unnamed group", () => {
    expect(parseRules([{ ...validRule, groupTitle: "" }]).ok).toBe(true);
  });

  it.each([
    1,
    "a".repeat(LIMITS.maxGroupTitleLength + 1),
    "line\nbreak",
    "nul\u0000",
  ])("rejects invalid group title %j", (groupTitle) => {
    expect(errorsOf([{ ...validRule, groupTitle }])).toEqual([
      "rules[0].groupTitle: must be a string of at most 100 characters without control characters",
    ]);
  });

  it("rejects a group title on the catch-all rule", () => {
    expect(errorsOf([{ ...validRule, pattern: "*" }])).toEqual([
      "rules[0].groupTitle: not allowed on the catch-all rule (title is the hostname)",
    ]);
  });

  it.each(["black", "Blue", 1, null])("rejects invalid color %j", (color) => {
    expect(errorsOf([{ ...validRule, color }])).toEqual([
      "rules[0].color: must be a Chrome tab group color",
    ]);
  });

  it.each([undefined, "true", 1])(
    "rejects non-boolean enabled %j",
    (enabled) => {
      expect(errorsOf([{ ...validRule, enabled }])).toEqual([
        "rules[0].enabled: must be a boolean",
      ]);
    },
  );

  it("reports every error with its path", () => {
    const errors = errorsOf([
      validRule,
      { id: 1, type: "hostname", pattern: 2, enabled: "no" },
    ]);

    expect(errors).toEqual([
      "rules[1].id: must be 1-64 characters among A-Z a-z 0-9 _ -",
      "rules[1].pattern: must be a string",
      "rules[1].enabled: must be a boolean",
    ]);
  });

  it("rejects duplicate ids and duplicate patterns", () => {
    const errors = errorsOf([
      validRule,
      { ...validRule, pattern: "gitlab.com" },
      { ...validRule, id: "other" },
      { ...validRule, id: "third" },
    ]);

    expect(errors).toEqual([
      'rules: duplicate id "gh"',
      'rules: duplicate hostname pattern "github.com"',
    ]);
  });

  it("allows the same pattern in an exact rule and a regex rule", () => {
    expect(
      parseRules([
        validRule,
        { id: "re", type: "regex", pattern: "github.com", enabled: true },
      ]).ok,
    ).toBe(true);
  });
});

describe("isValidHostnamePattern", () => {
  it.each([
    "*",
    "localhost",
    "github.com",
    "a.b.c.example.co.uk",
    "my-site.example",
    "192.168.1.10",
    "xn--caf-dma.fr",
    "[::1]",
    "[2001:db8::1]",
    `${"a".repeat(63)}.com`,
  ])("accepts %s", (pattern) => {
    expect(isValidHostnamePattern(pattern)).toBe(true);
  });

  it.each([
    "",
    "**",
    "-github.com",
    "github-.com",
    "github..com",
    ".github.com",
    "github.com.",
    "github_com",
    "git hub.com",
    "café.fr",
    "[::g]",
    "localhost:3000",
    `${"a".repeat(64)}.com`,
    Array.from({ length: 64 }, () => "abc").join("."),
  ])("rejects %j", (pattern) => {
    expect(isValidHostnamePattern(pattern)).toBe(false);
  });
});
