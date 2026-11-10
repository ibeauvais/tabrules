import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  catchAllRule,
  launchHarness,
  POLL_OPTIONS,
  withoutColor,
  type Harness,
} from "./harness.js";

describe("grouping in Chrome", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await launchHarness();
  });

  afterEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("groups tabs of a hostname with the rule title and color", async () => {
    await harness.setStorage({
      rules: [
        {
          id: "alpha",
          type: "hostname",
          pattern: "alpha.test",
          groupTitle: "Alpha",
          color: "blue",
          enabled: true,
        },
      ],
    });
    await harness.openTab(harness.urlFor("alpha.test", "/one"));
    await harness.openTab(harness.urlFor("alpha.test", "/two"));

    await expect
      .poll(() => harness.readGroups(), POLL_OPTIONS)
      .toEqual([
        {
          title: "Alpha",
          color: "blue",
          hostnames: ["alpha.test", "alpha.test"],
        },
      ]);
  });

  it("groups every hostname matching a regex rule into one group", async () => {
    await harness.setStorage({
      rules: [
        {
          id: "alpha-family",
          type: "regex",
          pattern: "(^|\\.)alpha\\.test$",
          groupTitle: "Alpha family",
          color: "purple",
          enabled: true,
        },
        catchAllRule,
      ],
    });
    await harness.openTab(harness.urlFor("alpha.test"));
    await harness.openTab(harness.urlFor("one.alpha.test"));
    await harness.openTab(harness.urlFor("beta.test"));

    await expect
      .poll(() => harness.readGroups(), POLL_OPTIONS)
      .toEqual([
        {
          title: "Alpha family",
          color: "purple",
          hostnames: ["alpha.test", "one.alpha.test"],
        },
        {
          title: "beta.test",
          color: expect.any(String) as string,
          hostnames: ["beta.test"],
        },
      ]);
  });

  it("applies the first matching rule in priority order", async () => {
    const familyRule = {
      id: "family",
      type: "regex",
      pattern: "(^|\\.)alpha\\.test$",
      groupTitle: "Family",
      enabled: true,
    };
    const oneRule = {
      id: "one",
      type: "hostname",
      pattern: "one.alpha.test",
      groupTitle: "One",
      enabled: true,
    };
    await harness.setStorage({ rules: [familyRule, oneRule] });
    await harness.openTab(harness.urlFor("one.alpha.test"));
    await harness.waitForGroups((current) => current[0]?.title === "Family");

    await harness.setStorage({ rules: [oneRule, familyRule] });
    await expect
      .poll(async () => withoutColor(await harness.readGroups()), POLL_OPTIONS)
      .toEqual([{ title: "One", hostnames: ["one.alpha.test"] }]);
  });

  it("creates one group per hostname with the catch-all rule", async () => {
    await harness.setStorage({ rules: [catchAllRule] });
    await harness.openTab(harness.urlFor("alpha.test"));
    await harness.openTab(harness.urlFor("sub.alpha.test"));

    await expect
      .poll(
        async () => (await harness.readGroups()).map((group) => group.title),
        POLL_OPTIONS,
      )
      .toEqual(["alpha.test", "sub.alpha.test"]);
  });
  it("moves a tab when it navigates to another hostname", async () => {
    await harness.setStorage({ rules: [catchAllRule] });
    const movingTabId = await harness.openTab(harness.urlFor("alpha.test"));
    await harness.openTab(harness.urlFor("beta.test"));
    await harness.waitForGroups((current) => current.length === 2);
    await harness.navigateTab(movingTabId, harness.urlFor("beta.test", "/x"));
    await expect
      .poll(() => harness.readGroups(), POLL_OPTIONS)
      .toEqual([
        {
          title: "beta.test",
          color: expect.any(String) as string,
          hostnames: ["beta.test", "beta.test"],
        },
      ]);
  });

  it("never touches groups created by the user, nor pinned tabs", async () => {
    const userTabId = await harness.openTab(harness.urlFor("alpha.test"));
    await harness.openTab(harness.urlFor("alpha.test", "/pinned"), {
      pinned: true,
    });
    await harness.worker.evaluate(async (tabId) => {
      const groupId = await chrome.tabs.group({ tabIds: tabId });
      await chrome.tabGroups.update(groupId, { title: "Mine" });
    }, userTabId);

    await harness.setStorage({ rules: [catchAllRule] });
    await harness.openTab(harness.urlFor("beta.test"));
    await expect
      .poll(async () => withoutColor(await harness.readGroups()), POLL_OPTIONS)
      .toEqual([
        { title: "beta.test", hostnames: ["beta.test"] },
        { title: "Mine", hostnames: ["alpha.test"] },
      ]);
  });

  it("pauses grouping when switched off and catches up when switched on", async () => {
    await harness.setStorage({ enabled: false, rules: [catchAllRule] });
    await harness.openTab(harness.urlFor("alpha.test"));
    await sleep(500);
    expect(await harness.readGroups()).toEqual([]);

    await harness.setStorage({ enabled: true });
    await expect
      .poll(async () => withoutColor(await harness.readGroups()), POLL_OPTIONS)
      .toEqual([{ title: "alpha.test", hostnames: ["alpha.test"] }]);
  });
});
