import { describe, expect, it } from "vitest";
import type { HostnameRule } from "./rule.js";
import {
  normalizeHostnameInput,
  ruleFromDraft,
  type RuleDraft,
} from "./rule-editing.js";

describe("normalizeHostnameInput", () => {
  it.each([
    ["github.com", "github.com"],
    ["  GitHub.COM  ", "github.com"],
    ["https://github.com/org/repo?q=1", "github.com"],
    ["github.com/org/repo", "github.com"],
    ["localhost:3000", "localhost"],
    ["http://user:pass@example.com", "example.com"],
    ["example.com.", "example.com"],
    ["café.fr", "xn--caf-dma.fr"],
    ["192.168.1.10", "192.168.1.10"],
    ["[::1]", "[::1]"],
    ["*", "*"],
    [" * ", "*"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeHostnameInput(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "*.github.com",
    "git hub.com",
    "ftp://example.com",
    "chrome://extensions",
    "http://",
    "github_com",
  ])("rejects %j", (input) => {
    expect(normalizeHostnameInput(input)).toBeNull();
  });
});

describe("ruleFromDraft", () => {
  const draft = (overrides: Partial<RuleDraft> = {}): RuleDraft => ({
    matchType: "hostname",
    patternInput: "github.com",
    groupTitle: "",
    color: "",
    ...overrides,
  });
  const identity = { id: "new", enabled: true };
  const existing: HostnameRule = {
    id: "gh",
    type: "hostname",
    pattern: "github.com",
    enabled: true,
  };

  it("builds a minimal rule", () => {
    expect(ruleFromDraft(draft(), identity, [])).toEqual({
      ok: true,
      rule: {
        id: "new",
        type: "hostname",
        pattern: "github.com",
        enabled: true,
      },
    });
  });

  it("keeps a trimmed title and a color", () => {
    const result = ruleFromDraft(
      draft({
        patternInput: "https://GitHub.com/x",
        groupTitle: "  Code ",
        color: "blue",
      }),
      { id: "new", enabled: false },
      [],
    );

    expect(result).toEqual({
      ok: true,
      rule: {
        id: "new",
        type: "hostname",
        pattern: "github.com",
        groupTitle: "Code",
        color: "blue",
        enabled: false,
      },
    });
  });

  it("drops the title of the catch-all rule", () => {
    const result = ruleFromDraft(
      draft({ patternInput: "*", groupTitle: "All" }),
      identity,
      [],
    );

    expect(result).toEqual({
      ok: true,
      rule: { id: "new", type: "hostname", pattern: "*", enabled: true },
    });
  });

  it("rejects an invalid hostname", () => {
    expect(
      ruleFromDraft(draft({ patternInput: "not a host" }), identity, []),
    ).toEqual({
      ok: false,
      error: "Enter a hostname such as github.com, or * for every site.",
    });
  });

  it("rejects a duplicate of another rule", () => {
    expect(ruleFromDraft(draft(), identity, [existing])).toEqual({
      ok: false,
      error: "A rule for github.com already exists.",
    });
  });

  it("allows saving a rule with its own unchanged pattern", () => {
    expect(
      ruleFromDraft(draft(), { id: "gh", enabled: true }, [existing]).ok,
    ).toBe(true);
  });

  it.each(["a".repeat(101), "line\nbreak"])(
    "rejects invalid title %j",
    (groupTitle) => {
      expect(ruleFromDraft(draft({ groupTitle }), identity, [])).toEqual({
        ok: false,
        error:
          "Group titles are limited to 100 characters, without line breaks.",
      });
    },
  );

  describe("regex rules", () => {
    const regexDraft = (overrides: Partial<RuleDraft> = {}) =>
      draft({ matchType: "regex", ...overrides });

    it("keeps the trimmed pattern as written, with a title", () => {
      const result = ruleFromDraft(
        regexDraft({
          patternInput: "  (^|\\.)google\\.com$ ",
          groupTitle: "Google",
        }),
        identity,
        [],
      );

      expect(result).toEqual({
        ok: true,
        rule: {
          id: "new",
          type: "regex",
          pattern: "(^|\\.)google\\.com$",
          groupTitle: "Google",
          enabled: true,
        },
      });
    });

    it("keeps the title of a regex that is just *", () => {
      const result = ruleFromDraft(
        regexDraft({ patternInput: "^.*$", groupTitle: "Everything" }),
        identity,
        [],
      );

      expect(result.ok && result.rule.groupTitle).toBe("Everything");
    });

    it.each([
      ["", "Invalid regular expression: must not be empty."],
      [
        "(?=x)",
        "Invalid regular expression: lookarounds and named groups are not supported at position 2.",
      ],
    ])("rejects invalid pattern %j", (patternInput, error) => {
      expect(ruleFromDraft(regexDraft({ patternInput }), identity, [])).toEqual(
        { ok: false, error },
      );
    });

    it("rejects a duplicate regex but not an exact rule with the same text", () => {
      expect(
        ruleFromDraft(regexDraft({ patternInput: "github.com" }), identity, [
          existing,
        ]).ok,
      ).toBe(true);
      expect(
        ruleFromDraft(regexDraft({ patternInput: "github.com" }), identity, [
          { ...existing, type: "regex" },
        ]),
      ).toEqual({ ok: false, error: "A rule for github.com already exists." });
    });
  });
});
