import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnabledFlag, createRulesCache } from "./rules-cache.js";

const catchAllRule = {
  id: "all",
  type: "hostname",
  pattern: "*",
  enabled: true,
};

describe("createRulesCache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("compiles the stored rules", async () => {
    const cache = createRulesCache(() => Promise.resolve([catchAllRule]));

    const rules = await cache.get();

    expect(rules.match("https://github.com/")?.key).toBe("hostname:github.com");
  });

  it("uses no rules when nothing is stored yet", async () => {
    const cache = createRulesCache(() => Promise.resolve(undefined));

    expect((await cache.get()).match("https://github.com/")).toBeNull();
  });

  it("applies the valid rules and logs counts when some stored rules are invalid", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const cache = createRulesCache(() =>
      Promise.resolve([
        {
          id: "future",
          type: "url-prefix",
          pattern: "https://x/",
          enabled: true,
        },
        { ...catchAllRule, id: "broken", pattern: "secret.example.com/path" },
        catchAllRule,
      ]),
    );

    expect((await cache.get()).match("https://github.com/")?.key).toBe(
      "hostname:github.com",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      JSON.stringify({
        level: "error",
        event: "stored_rules_invalid",
        errorCount: 2,
        appliedRuleCount: 1,
      }),
    );
  });

  it("loads the rules once until invalidated", async () => {
    const loadRules = vi.fn(() => Promise.resolve([catchAllRule]));
    const cache = createRulesCache(loadRules);

    await cache.get();
    await cache.get();
    expect(loadRules).toHaveBeenCalledOnce();

    cache.invalidate();
    await cache.get();
    expect(loadRules).toHaveBeenCalledTimes(2);
  });

  it("retries loading after a storage failure", async () => {
    const loadRules = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce([catchAllRule]);
    const cache = createRulesCache(loadRules);

    await expect(cache.get()).rejects.toThrow("storage unavailable");
    expect((await cache.get()).match("https://github.com/")).not.toBeNull();
  });
});

describe("createEnabledFlag", () => {
  it.each([
    [undefined, true],
    [true, true],
    [false, false],
    ["false", true],
  ])("reads stored value %j as %j", async (stored, expected) => {
    const flag = createEnabledFlag(() => Promise.resolve(stored));

    expect(await flag.get()).toBe(expected);
  });
});
