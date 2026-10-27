import { describe, expect, it } from "vitest";
import { compileRules } from "./registry.js";
import type { HostnameRule } from "./rule.js";

const rule = (overrides: Partial<HostnameRule> = {}): HostnameRule => ({
  id: "r1",
  type: "hostname",
  pattern: "*",
  enabled: true,
  ...overrides,
});

describe("compileRules", () => {
  it("matches http and https URLs", () => {
    const compiled = compileRules([rule()]);

    expect(compiled.match("http://example.com/")?.key).toBe(
      "hostname:example.com",
    );
    expect(compiled.match("https://example.com/")?.key).toBe(
      "hostname:example.com",
    );
  });

  it.each([
    "chrome://extensions/",
    "chrome-extension://abcdefghijklmnop/options.html",
    "about:blank",
    "file:///tmp/a.txt",
    "data:text/html,hello",
    "javascript:alert(1)",
    "ftp://example.com/",
  ])("ignores unsupported scheme %s", (url) => {
    expect(compileRules([rule()]).match(url)).toBeNull();
  });

  it.each(["", "not a url", "https://"])("ignores invalid URL %j", (url) => {
    expect(compileRules([rule()]).match(url)).toBeNull();
  });

  it("ignores disabled rules", () => {
    const compiled = compileRules([
      rule({ id: "gh", pattern: "github.com", enabled: false }),
      rule({ id: "all", enabled: false }),
    ]);

    expect(compiled.match("https://github.com/")).toBeNull();
  });

  it("falls back to an enabled catch-all when the exact rule is disabled", () => {
    const compiled = compileRules([
      rule({ id: "gh", pattern: "github.com", enabled: false }),
      rule({ id: "all" }),
    ]);

    expect(compiled.match("https://github.com/")?.key).toBe(
      "hostname:github.com",
    );
  });

  it("returns null when no rule matches", () => {
    expect(
      compileRules([rule({ pattern: "github.com" })]).match(
        "https://example.com/",
      ),
    ).toBeNull();
  });
});
