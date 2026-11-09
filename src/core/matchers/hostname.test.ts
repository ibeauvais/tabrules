import { describe, expect, it } from "vitest";
import type { HostnameRule } from "../rule.js";
import { catchAllMatcher, exactHostnameMatcher } from "./hostname.js";

const rule = (overrides: Partial<HostnameRule> = {}): HostnameRule => ({
  id: "r1",
  type: "hostname",
  pattern: "*",
  enabled: true,
  ...overrides,
});

describe("exactHostnameMatcher", () => {
  const match = (rules: HostnameRule[], url: string) =>
    exactHostnameMatcher
      .compile(rules.map((rule, priority) => ({ rule, priority })))
      .match(new URL(url))?.target ?? null;

  it("returns null when there are no rules", () => {
    expect(match([], "https://github.com/")).toBeNull();
  });

  it("matches an exact hostname rule, keyed by rule id", () => {
    const rules = [
      rule({
        id: "gh",
        pattern: "github.com",
        groupTitle: "GitHub",
        color: "blue",
      }),
    ];

    expect(match(rules, "https://github.com/org/repo")).toEqual({
      key: "rule:gh",
      title: "GitHub",
      color: "blue",
    });
  });

  it("defaults the title to the hostname and omits an unset color", () => {
    expect(
      match([rule({ pattern: "github.com" })], "https://github.com/"),
    ).toEqual({
      key: "rule:r1",
      title: "github.com",
    });
  });

  it("matches the full hostname only, not subdomains or parents", () => {
    const rules = [rule({ pattern: "github.com" })];

    expect(match(rules, "https://gist.github.com/")).toBeNull();
    expect(match(rules, "https://www.github.com/")).toBeNull();
    expect(
      match([rule({ pattern: "docs.github.com" })], "https://github.com/"),
    ).toBeNull();
  });

  it("ignores the catch-all rule", () => {
    expect(match([rule()], "https://github.com/")).toBeNull();
  });

  it.each([
    ["uppercase", "https://GitHub.COM/", "github.com"],
    ["port", "http://localhost:3000/", "localhost"],
    ["credentials", "https://user:secret@example.com/", "example.com"],
    ["trailing dot", "https://example.com./", "example.com"],
    ["IPv4", "http://192.168.1.10:8080/", "192.168.1.10"],
    ["IPv6", "http://[::1]:8080/", "[::1]"],
    ["IDN as punycode", "https://café.fr/", "xn--caf-dma.fr"],
  ])("normalizes the hostname (%s)", (_case, url, hostname) => {
    expect(match([rule({ pattern: hostname })], url)?.title).toBe(hostname);
  });
});

describe("catchAllMatcher", () => {
  const match = (rules: HostnameRule[], url: string) =>
    catchAllMatcher
      .compile(rules.map((rule, priority) => ({ rule, priority })))
      .match(new URL(url))?.target ?? null;

  it("returns null without a catch-all rule", () => {
    expect(
      match([rule({ pattern: "github.com" })], "https://github.com/"),
    ).toBeNull();
  });

  it("groups any hostname, one group per hostname", () => {
    const rules = [rule({ id: "all", color: "grey" })];

    expect(match(rules, "https://mail.google.com/")).toEqual({
      key: "hostname:mail.google.com",
      title: "mail.google.com",
      color: "grey",
    });
    expect(match(rules, "https://docs.google.com./")?.key).toBe(
      "hostname:docs.google.com",
    );
  });

  it("returns null for a URL without hostname", () => {
    expect(match([rule()], "file:///tmp/a.txt")).toBeNull();
  });
});

describe("hostname matchers priority", () => {
  it("returns the priority of the matched rule", () => {
    const compiled = exactHostnameMatcher.compile([
      { rule: rule({ id: "gh", pattern: "github.com" }), priority: 7 },
    ]);

    expect(compiled.match(new URL("https://github.com/"))?.priority).toBe(7);
  });

  it("keeps the highest-priority rule for a duplicated hostname", () => {
    const compiled = exactHostnameMatcher.compile([
      { rule: rule({ id: "first", pattern: "github.com" }), priority: 0 },
      { rule: rule({ id: "second", pattern: "github.com" }), priority: 1 },
    ]);

    expect(compiled.match(new URL("https://github.com/"))?.target.key).toBe(
      "rule:first",
    );
  });
});
