import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  catchAllRule,
  launchHarness,
  waitFor,
  type Harness,
} from "./harness.js";

const HOSTNAME_COUNT = 10;
const TABS_PER_HOSTNAME = 30;
const TAB_COUNT = HOSTNAME_COUNT * TABS_PER_HOSTNAME;
const GROUP_ALL_BUDGET_MS = 2_000;

describe("performance", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await launchHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it(`groups ${String(TAB_COUNT)} open tabs within ${String(GROUP_ALL_BUDGET_MS)} ms`, async () => {
    const urls = Array.from({ length: TAB_COUNT }, (_, index) =>
      harness.urlFor(`site${String(index % HOSTNAME_COUNT)}.test`),
    );
    await harness.worker.evaluate(async (tabUrls) => {
      await Promise.all(
        tabUrls.map((url) => chrome.tabs.create({ url, active: false })),
      );
    }, urls);
    await waitFor(
      () =>
        harness.worker.evaluate(
          async () =>
            (
              await chrome.tabs.query({
                url: "http://*.test/*",
                status: "complete",
              })
            ).length,
        ),
      (count) => count === TAB_COUNT,
      60_000,
    );

    const elapsedMs = await harness.worker.evaluate(
      async (rules, expectedTabCount) => {
        const start = performance.now();
        await chrome.storage.local.set({ rules });
        for (;;) {
          const tabs = await chrome.tabs.query({ url: "http://*.test/*" });
          const groupedCount = tabs.filter((tab) => tab.groupId !== -1).length;
          if (groupedCount === expectedTabCount) {
            return performance.now() - start;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      },
      [catchAllRule],
      TAB_COUNT,
    );

    console.info(
      JSON.stringify({
        event: "group_all_benchmark",
        tabs: TAB_COUNT,
        elapsedMs,
      }),
    );
    expect(await harness.readGroups()).toHaveLength(HOSTNAME_COUNT);
    expect(elapsedMs).toBeLessThan(GROUP_ALL_BUDGET_MS);
  }, 120_000);
});
