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
const BENCHMARK_RUNS = 3;

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

    const runsMs = await harness.worker.evaluate(
      async (rules, expectedTabCount, runCount) => {
        const waitForGroupedCount = async (expected: number) => {
          for (;;) {
            const tabs = await chrome.tabs.query({ url: "http://*.test/*" });
            if (tabs.filter((tab) => tab.groupId !== -1).length === expected) {
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        };
        const durations: number[] = [];
        for (let run = 0; run < runCount; run++) {
          await chrome.storage.local.set({ rules: [] });
          await waitForGroupedCount(0);
          const start = performance.now();
          await chrome.storage.local.set({ rules });
          await waitForGroupedCount(expectedTabCount);
          durations.push(performance.now() - start);
        }
        return durations;
      },
      [catchAllRule],
      TAB_COUNT,
      BENCHMARK_RUNS,
    );
    const medianMs = [...runsMs].sort((left, right) => left - right)[
      Math.floor(runsMs.length / 2)
    ];

    console.info(
      JSON.stringify({
        event: "group_all_benchmark",
        tabs: TAB_COUNT,
        runsMs,
        medianMs,
      }),
    );
    expect(await harness.readGroups()).toHaveLength(HOSTNAME_COUNT);
    expect(medianMs).toBeLessThan(GROUP_ALL_BUDGET_MS);
  }, 120_000);
});
