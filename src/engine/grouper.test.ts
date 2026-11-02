import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileRules, type CompiledRules } from "../core/registry.js";
import type { HostnameRule } from "../core/rule.js";
import { createGrouper, type Grouper } from "./grouper.js";
import { createManagedGroups, type ManagedGroups } from "./managed-groups.js";
import { FakeBrowser, MemoryStore } from "./testing/fake-browser.js";

const rule = (overrides: Partial<HostnameRule> = {}): HostnameRule => ({
  id: "all",
  type: "hostname",
  pattern: "*",
  enabled: true,
  ...overrides,
});

describe("createGrouper", () => {
  let browser: FakeBrowser;
  let managedGroups: ManagedGroups;
  let rules: CompiledRules;
  let grouper: Grouper;

  beforeEach(() => {
    browser = new FakeBrowser();
    managedGroups = createManagedGroups(new MemoryStore());
    rules = compileRules([rule()]);
    grouper = createGrouper({
      tabs: browser,
      managedGroups,
      getRules: () => Promise.resolve(rules),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a titled, colored group for a matching tab", async () => {
    rules = compileRules([
      rule({
        id: "gh",
        pattern: "github.com",
        groupTitle: "GitHub",
        color: "blue",
      }),
    ]);
    browser.addTab({ id: 1, url: "https://github.com/" });

    await grouper.applyToTab(1);

    expect(browser.groupOf(1)).toEqual({
      windowId: 1,
      title: "GitHub",
      color: "blue",
    });
    expect(
      await managedGroups.isManaged(browser.tabs.get(1)?.groupId ?? -1),
    ).toBe(true);
  });

  it("adds a second tab of the same hostname to the existing group", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/a" })
      .addTab({ id: 2, url: "https://github.com/b" });

    await grouper.applyToTab(1);
    await grouper.applyToTab(2);

    expect(browser.groups.size).toBe(1);
    expect(browser.tabs.get(2)?.groupId).toBe(browser.tabs.get(1)?.groupId);
  });

  it("creates one group per hostname with the catch-all rule", async () => {
    browser
      .addTab({ id: 1, url: "https://mail.google.com/" })
      .addTab({ id: 2, url: "https://docs.google.com/" });

    await grouper.applyToAllTabs();

    expect(browser.groupOf(1)?.title).toBe("mail.google.com");
    expect(browser.groupOf(2)?.title).toBe("docs.google.com");
  });

  it("keeps groups per window", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/", windowId: 1 })
      .addTab({ id: 2, url: "https://github.com/", windowId: 2 });

    await grouper.applyToAllTabs();

    expect(browser.groupOf(1)?.windowId).toBe(1);
    expect(browser.groupOf(2)?.windowId).toBe(2);
  });

  it("groups all tabs of a bucket with a single API call", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/a" })
      .addTab({ id: 2, url: "https://github.com/b" })
      .addTab({ id: 3, url: "https://github.com/c" });

    await grouper.applyToAllTabs();

    expect(browser.calls).toEqual(["createGroup 1,2,3", "updateGroup 100"]);
  });

  it("makes no API call when the tab is already in its group", async () => {
    browser.addTab({ id: 1, url: "https://github.com/" });
    await grouper.applyToTab(1);
    browser.calls.length = 0;

    await grouper.applyToTab(1);

    expect(browser.calls).toEqual([]);
  });

  it("moves a tab to another managed group when its hostname changes", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/" })
      .addTab({ id: 2, url: "https://gitlab.com/" });
    await grouper.applyToAllTabs();

    const tab = browser.tabs.get(1);
    if (tab) tab.url = "https://gitlab.com/";
    await grouper.applyToTab(1);

    expect(browser.groupOf(1)?.title).toBe("gitlab.com");
    expect(browser.groups.size).toBe(1);
  });

  it("ungroups a tab leaving a managed group for an unmatched hostname", async () => {
    rules = compileRules([rule({ id: "gh", pattern: "github.com" })]);
    browser.addTab({ id: 1, url: "https://github.com/" });
    await grouper.applyToTab(1);

    const tab = browser.tabs.get(1);
    if (tab) tab.url = "https://example.com/";
    await grouper.applyToTab(1);

    expect(browser.tabs.get(1)?.groupId).toBe(-1);
  });

  it("leaves ungrouped tabs alone when no rule matches", async () => {
    rules = compileRules([]);
    browser.addTab({ id: 1, url: "https://github.com/" });

    await grouper.applyToTab(1);

    expect(browser.calls).toEqual([]);
  });

  it("never touches tabs in groups the user created", async () => {
    browser
      .addGroup(7, { windowId: 1, title: "Mine" })
      .addTab({ id: 1, url: "https://github.com/", groupId: 7 });

    await grouper.applyToAllTabs();

    expect(browser.calls).toEqual([]);
    expect(browser.groupOf(1)?.title).toBe("Mine");
  });

  it("ignores pinned tabs", async () => {
    browser.addTab({ id: 1, url: "https://github.com/", pinned: true });

    await grouper.applyToTab(1);

    expect(browser.calls).toEqual([]);
  });

  it("ignores a tab closed before its event is processed", async () => {
    await grouper.applyToTab(42);

    expect(browser.calls).toEqual([]);
  });

  it("adopts an existing group with the target title, e.g. after a browser restart", async () => {
    browser
      .addGroup(7, { windowId: 1, title: "github.com" })
      .addTab({ id: 1, url: "https://github.com/a", groupId: 7 })
      .addTab({ id: 2, url: "https://github.com/b" });

    await grouper.applyToTab(2);

    expect(browser.tabs.get(2)?.groupId).toBe(7);
    expect(await managedGroups.isManaged(7)).toBe(true);
  });

  it("does not adopt unnamed groups for rules with an empty title", async () => {
    rules = compileRules([
      rule({ id: "gh", pattern: "github.com", groupTitle: "" }),
    ]);
    browser
      .addGroup(7, { windowId: 1, title: "" })
      .addTab({ id: 1, url: "https://example.com/", groupId: 7 })
      .addTab({ id: 2, url: "https://github.com/" });

    await grouper.applyToTab(2);

    expect(browser.tabs.get(2)?.groupId).not.toBe(7);
    expect(browser.groups.size).toBe(2);
  });

  it("recreates a group that disappeared while still marked as managed", async () => {
    await managedGroups.add({
      groupId: 55,
      windowId: 1,
      key: "hostname:github.com",
    });
    browser.addTab({ id: 1, url: "https://github.com/" });

    await grouper.applyToTab(1);

    expect(browser.groupOf(1)?.title).toBe("github.com");
    expect(await managedGroups.isManaged(55)).toBe(false);
  });

  it("creates a single group when tabs are processed concurrently", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/a" })
      .addTab({ id: 2, url: "https://github.com/b" });

    await Promise.all([grouper.applyToTab(1), grouper.applyToTab(2)]);

    expect(browser.groups.size).toBe(1);
  });

  it("coalesces pending events into one batch", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/a" })
      .addTab({ id: 2, url: "https://github.com/b" });

    await Promise.all([
      grouper.applyToTab(1),
      grouper.applyToTab(2),
      grouper.applyToTab(1),
    ]);

    expect(browser.reads).toEqual(["getTab 1", "getTab 2"]);
    expect(browser.calls).toEqual(["createGroup 1,2", "updateGroup 100"]);
  });

  it("lets a pending full pass absorb pending tab events", async () => {
    browser.addTab({ id: 1, url: "https://github.com/" });

    await Promise.all([grouper.applyToTab(1), grouper.applyToAllTabs()]);

    expect(browser.reads).toEqual(["listTabs"]);
  });

  it("processes events received during a pass in a following pass", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/" })
      .addTab({ id: 2, url: "https://gitlab.com/" });

    const firstPass = grouper.applyToTab(1);
    await Promise.resolve();
    const secondPass = grouper.applyToTab(2);
    await Promise.all([firstPass, secondPass]);

    expect(browser.reads).toEqual(["getTab 1", "getTab 2"]);
    expect(browser.groups.size).toBe(2);
  });

  it("puts rules sharing a title in the same group", async () => {
    rules = compileRules([
      rule({ id: "gh", pattern: "github.com", groupTitle: "Code" }),
      rule({ id: "gl", pattern: "gitlab.com", groupTitle: "Code" }),
    ]);
    browser
      .addTab({ id: 1, url: "https://github.com/" })
      .addTab({ id: 2, url: "https://gitlab.com/" });

    await grouper.applyToAllTabs();

    expect(browser.groups.size).toBe(1);
    expect(browser.tabs.get(2)?.groupId).toBe(browser.tabs.get(1)?.groupId);
  });

  it("keeps grouping other buckets when one fails, then reports every failure", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/" })
      .addTab({ id: 2, url: "https://gitlab.com/" });
    browser.failNextCall = new Error("boom");

    await grouper.applyToAllTabs();

    expect(browser.groupOf(2)?.title).toBe("gitlab.com");
    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify({
        level: "error",
        event: "grouping_failed",
        error: "boom",
      }),
    );
  });

  it("logs unexpected errors and keeps processing later events", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/" })
      .addTab({ id: 2, url: "https://gitlab.com/" });
    browser.failNextCall = new Error("boom");

    await grouper.applyToTab(1);
    await grouper.applyToTab(2);

    expect(console.error).toHaveBeenCalledWith(
      JSON.stringify({
        level: "error",
        event: "grouping_failed",
        error: "boom",
      }),
    );
    expect(browser.groupOf(2)?.title).toBe("gitlab.com");
  });

  it("rethrows unexpected errors when adding to an existing group", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/a" })
      .addTab({ id: 2, url: "https://github.com/b" });
    await grouper.applyToTab(1);
    browser.failNextCall = new Error("boom");

    await grouper.applyToTab(2);

    expect(console.error).toHaveBeenCalledOnce();
    expect(browser.tabs.get(2)?.groupId).toBe(-1);
  });

  it("skips a bucket whose tab closed during grouping and continues", async () => {
    browser
      .addTab({ id: 1, url: "https://github.com/" })
      .addTab({ id: 2, url: "https://gitlab.com/" });
    browser.failNextCall = new Error("No tab with id: 1.");

    await grouper.applyToAllTabs();

    expect(console.warn).toHaveBeenCalledWith(
      JSON.stringify({ level: "warn", event: "tab_closed_during_grouping" }),
    );
    expect(browser.groupOf(2)?.title).toBe("gitlab.com");
  });

  it("skips ungrouping when the tab closed meanwhile", async () => {
    rules = compileRules([rule({ id: "gh", pattern: "github.com" })]);
    browser.addTab({ id: 1, url: "https://github.com/" });
    await grouper.applyToTab(1);
    const tab = browser.tabs.get(1);
    if (tab) tab.url = "https://example.com/";
    browser.failNextCall = new Error("No tab with id: 1.");

    await grouper.applyToTab(1);

    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
  });
});
