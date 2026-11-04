import { describe, expect, it } from "vitest";
import type { RegexRule } from "../rule.js";
import { regexMatcher } from "./regex.js";

const rule = (overrides: Partial<RegexRule> = {}): RegexRule => ({
  id: "r1",
  type: "regex",
  pattern: "(^|\\.)google\\.com$",
  enabled: true,
  ...overrides,
});

const match = (rules: RegexRule[], url: string) =>
  regexMatcher.compile(rules).match(new URL(url));

describe("regexMatcher", () => {
  it("puts every matching hostname in one group keyed by rule id", () => {
    const rules = [rule({ id: "google", groupTitle: "Google", color: "red" })];

    for (const url of [
      "https://google.com/",
      "https://mail.google.com/",
      "https://docs.google.com./x",
    ]) {
      expect(match(rules, url)).toEqual({
        key: "rule:google",
        title: "Google",
        color: "red",
      });
    }
  });

  it("tests the hostname only, not the path or query", () => {
    expect(match([rule()], "https://evil.test/google.com")).toBeNull();
    expect(match([rule()], "https://evil.test/?q=.google.com")).toBeNull();
  });

  it("defaults the title to the pattern", () => {
    expect(match([rule()], "https://google.com/")?.title).toBe(
      "(^|\\.)google\\.com$",
    );
  });

  it("uses the first matching rule in list order", () => {
    const rules = [
      rule({ id: "mail", pattern: "^mail\\." }),
      rule({ id: "google" }),
    ];

    expect(match(rules, "https://mail.google.com/")?.key).toBe("rule:mail");
    expect(match(rules, "https://docs.google.com/")?.key).toBe("rule:google");
  });

  it("returns null when no rule matches", () => {
    expect(match([rule()], "https://notgoogle.com/")).toBeNull();
  });

  it("skips rules whose pattern does not compile", () => {
    const rules = [rule({ id: "broken", pattern: "(?=a)" }), rule()];

    expect(match(rules, "https://google.com/")?.key).toBe("rule:r1");
  });
});
