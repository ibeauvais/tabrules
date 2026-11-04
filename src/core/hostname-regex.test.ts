import { describe, expect, it } from "vitest";
import { compileHostnameRegex, REGEX_LIMITS } from "./hostname-regex.js";

const compile = (source: string) => {
  const result = compileHostnameRegex(source);
  if (!result.ok) {
    throw new Error(`expected ${source} to compile: ${result.error}`);
  }
  return result.regex;
};

const errorOf = (source: string): string => {
  const result = compileHostnameRegex(source);
  if (result.ok) {
    throw new Error(`expected ${source} to be rejected`);
  }
  return result.error;
};

const PATTERNS = [
  "",
  "^",
  "$",
  "^$",
  "google",
  "^google\\.com$",
  "\\.google\\.com$",
  "(^|\\.)google\\.com$",
  "(?:^|\\.)github\\.com$",
  "a^b",
  "a$b",
  "^a|b$",
  "(a$|b)c?",
  "^(a|$)",
  "(^)*a",
  "^(mail|docs)\\.google\\.com$",
  "^(?:git(hub|lab))\\.com$",
  "git(hub|lab)",
  "^[a-z]+\\.example\\.org$",
  "^[^.]+\\.test$",
  "[^a-z]",
  "\\d+",
  "^\\d{1,3}(\\.\\d{1,3}){3}$",
  "^a{2}$",
  "^a{2,3}$",
  "^a{2,}$",
  "^a{0,2}b$",
  "^(ab)*$",
  "^(a|b)+c?$",
  "x*",
  "^.*$",
  ".",
  "^.$",
  "localhost",
  "[\\w-]+\\.dev$",
  "^[a-c-]+$",
  "^[-a]+$",
  "a|b|c",
  "^(a|)b$",
  "^(a*)*$",
  "^(a|a)*$",
  "^a+?$",
  "^a*?b",
  "\\-",
  "^\\[::1\\]$",
  "my-site",
  "\\$",
  "a\\$$",
  "\\\\$",
  "^[.]+$",
  "^[\\d.]+$",
  "\\w+\\.\\w+",
];

const HOSTNAMES = [
  "",
  "google.com",
  "mail.google.com",
  "docs.google.com",
  "notgoogle.com",
  "google.com.evil.test",
  "example.org",
  "a.example.org",
  "192.168.1.10",
  "1.2.3",
  "localhost",
  "[::1]",
  "github.com",
  "gitlab.com",
  "gitea.com",
  "a",
  "aa",
  "aaa",
  "aaaa",
  "b",
  "ab",
  "aab",
  "abab",
  "abc",
  "c",
  "x.test",
  "my-site.dev",
  "a-b-c",
  "...",
  "a$",
  "a\\",
  "under_score.dev",
];

describe("compileHostnameRegex", () => {
  describe("matches exactly like the native RegExp engine", () => {
    it.each(PATTERNS)("pattern %j", (pattern) => {
      const ours = compile(pattern);
      const native = new RegExp(pattern);
      const mismatches = HOSTNAMES.filter(
        (hostname) => ours.test(hostname) !== native.test(hostname),
      );

      expect(mismatches).toEqual([]);
    });
  });

  it("is reusable across many calls", () => {
    const regex = compile("^(a|b)+$");

    expect(
      ["ab", "ba", "abc", "aaa", "", "bb"].map((h) => regex.test(h)),
    ).toEqual([true, true, false, true, false, true]);
  });

  it.each([
    ["^(a+)+$", `${"a".repeat(253)}!`],
    ["^(a|a)*$", `${"a".repeat(253)}!`],
    ["^(a*)*b$", "a".repeat(253)],
    ["(\\w+\\.?)+$", `${"a.".repeat(126)}!`],
    [`^${"a?".repeat(40)}${"a".repeat(40)}$`, "a".repeat(40)],
  ])(
    "runs catastrophic-backtracking pattern %j in linear time",
    (pattern, hostname) => {
      const regex = compile(pattern);
      const start = performance.now();

      regex.test(hostname);

      expect(performance.now() - start).toBeLessThan(50);
    },
  );

  it.each([
    ["\\1", 'unsupported escape "\\1" at position 1'],
    ["\\b", 'unsupported escape "\\b" at position 1'],
    ["\\s", 'unsupported escape "\\s" at position 1'],
    ["\\D", 'unsupported escape "\\D" at position 1'],
    ["a\\", "pattern ends with a backslash at position 2"],
    ["(?=a)", "lookarounds and named groups are not supported at position 2"],
    [
      "(?<name>a)",
      "lookarounds and named groups are not supported at position 2",
    ],
    ["(a", 'missing ")" at position 3'],
    ["a)", 'unmatched ")" at position 2'],
    ["[a", 'missing "]" at position 3'],
    ["[]", "empty character class at position 2"],
    ["[z-a]", "invalid range in character class at position 5"],
    ["[\\d-z]", "invalid range in character class at position 6"],
    ["a]", 'use "\\]" for a literal "]" at position 2'],
    ["a}", 'use "\\}" for a literal "}" at position 2'],
    ["*a", "nothing to repeat at position 1"],
    ["a|+", "nothing to repeat at position 3"],
    ["a**", "nested quantifier at position 3"],
    ["a{2}{3}", "nested quantifier at position 5"],
    ["a{", 'invalid quantifier, use "\\{" for a literal brace at position 2'],
    [
      "a{,3}",
      'invalid quantifier, use "\\{" for a literal brace at position 2',
    ],
    ["a{3,2}", "repeat counts must be ordered and at most 63 at position 2"],
    ["a{64}", "repeat counts must be ordered and at most 63 at position 2"],
    ["a{1,64}", "repeat counts must be ordered and at most 63 at position 2"],
    ["^*", "nothing to repeat at position 2"],
    ["a$+", "nothing to repeat at position 3"],
    ["Google", "use lowercase letters, hostnames are lowercase at position 1"],
    ["[A-Z]", "use lowercase letters, hostnames are lowercase at position 2"],
  ])("rejects %j", (pattern, expectedError) => {
    expect(errorOf(pattern)).toBe(expectedError);
  });

  it("rejects patterns whose automaton exceeds the state limit", () => {
    expect(errorOf("((a{63}){63}){63}")).toBe("pattern is too complex");
    expect(REGEX_LIMITS.maxStates).toBe(2_000);
  });
});
