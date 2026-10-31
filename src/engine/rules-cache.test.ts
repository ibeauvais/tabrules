import { afterEach, describe, expect, it, vi } from "vitest";
import { createRulesCache } from "./rules-cache.js";

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

  it("uses no rules and logs the error count when stored rules are invalid", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const cache = createRulesCache(() =>
      Promise.resolve([
        { ...catchAllRule, pattern: "secret.example.com/path" },
      ]),
    );

    expect((await cache.get()).match("https://github.com/")).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      JSON.stringify({
        level: "error",
        event: "stored_rules_invalid",
        errorCount: 1,
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
