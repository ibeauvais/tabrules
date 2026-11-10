import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  launchHarness,
  POLL_OPTIONS,
  waitFor,
  withoutColor,
  type Harness,
} from "./harness.js";

describe("options page and popup", () => {
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

  it("adds a rule from the form and groups matching tabs", async () => {
    const page = await harness.browser.newPage();
    await page.goto(harness.extensionUrl("ui/options/options.html"));
    await harness.openTab(harness.urlFor("alpha.test"));

    await page.type("#pattern", "https://Alpha.test/some/path");
    await page.type("#group-title", "Alpha");
    await page.select("#color", "green");
    await page.click("#submit");

    await expect
      .poll(() => harness.readGroups(), POLL_OPTIONS)
      .toEqual([{ title: "Alpha", color: "green", hostnames: ["alpha.test"] }]);
    expect(await page.$$eval("#rules-body tr", (rows) => rows.length)).toBe(1);
    await page.close();
  });

  it("adds a regex rule from the form", async () => {
    const page = await harness.browser.newPage();
    await page.goto(harness.extensionUrl("ui/options/options.html"));
    await harness.openTab(harness.urlFor("one.alpha.test"));
    await harness.openTab(harness.urlFor("two.alpha.test"));

    await page.select("#match-type", "regex");
    expect(
      await page.$eval("#regex-help", (element) =>
        element.hasAttribute("hidden"),
      ),
    ).toBe(false);
    await page.type("#pattern", "\\.alpha\\.test$");
    await page.type("#group-title", "Alpha");
    await page.click("#submit");

    await expect
      .poll(async () => withoutColor(await harness.readGroups()), POLL_OPTIONS)
      .toEqual([
        { title: "Alpha", hostnames: ["one.alpha.test", "two.alpha.test"] },
      ]);
    expect(await harness.readStorage("rules")).toEqual([
      {
        id: expect.any(String) as string,
        type: "regex",
        pattern: "\\.alpha\\.test$",
        groupTitle: "Alpha",
        enabled: true,
      },
    ]);
    await page.close();
  });

  it("changes the priority with the move buttons", async () => {
    await harness.setStorage({
      rules: [
        { id: "a", type: "hostname", pattern: "alpha.test", enabled: true },
        { id: "b", type: "hostname", pattern: "beta.test", enabled: true },
      ],
    });
    const page = await harness.browser.newPage();
    await page.goto(harness.extensionUrl("ui/options/options.html"));

    await page.click('button[aria-label="Move rule for alpha.test down"]');

    const ruleIds = await waitFor(
      async () =>
        ((await harness.readStorage("rules")) as { id: string }[]).map(
          (rule) => rule.id,
        ),
      (ids) => ids[0] === "b",
    );
    expect(ruleIds).toEqual(["b", "a"]);
    expect(
      await page.$eval(
        'button[aria-label="Move rule for beta.test up"]',
        (button) => button.hasAttribute("disabled"),
      ),
    ).toBe(true);
    await page.close();
  });

  it("adds a new rule above the catch-all and flags rules it shadows", async () => {
    await harness.setStorage({
      rules: [
        { id: "all", type: "hostname", pattern: "*", enabled: true },
        { id: "late", type: "hostname", pattern: "late.test", enabled: true },
      ],
    });
    const page = await harness.browser.newPage();
    await page.goto(harness.extensionUrl("ui/options/options.html"));
    expect(
      await page.$$eval("#rules-body .warning", (warnings) => warnings.length),
    ).toBe(1);

    await page.type("#pattern", "alpha.test");
    await page.click("#submit");

    const rules = await waitFor(
      () => harness.readStorage("rules"),
      (stored) => Array.isArray(stored) && stored.length === 3,
    );
    expect(
      (rules as { pattern: string }[]).map((rule) => rule.pattern),
    ).toEqual(["alpha.test", "*", "late.test"]);
    await page.close();
  });

  it("shows an error for an invalid regex", async () => {
    const page = await harness.browser.newPage();
    await page.goto(harness.extensionUrl("ui/options/options.html"));

    await page.select("#match-type", "regex");
    await page.type("#pattern", "(?=alpha)");
    await page.click("#submit");

    expect(
      await page.$eval("#form-error", (element) => element.textContent),
    ).toBe(
      "Invalid regular expression: lookarounds and named groups are not supported at position 2.",
    );
    await page.close();
  });

  it("shows an error for an invalid hostname and saves nothing", async () => {
    const page = await harness.browser.newPage();
    await page.goto(harness.extensionUrl("ui/options/options.html"));

    await page.type("#pattern", "*.alpha.test");
    await page.click("#submit");

    expect(
      await page.$eval("#form-error", (element) => element.textContent),
    ).toContain("Enter a hostname");
    expect(await harness.readStorage("rules")).toBeUndefined();
    await page.close();
  });

  it("switches automatic grouping off from the popup", async () => {
    const page = await harness.browser.newPage();
    await page.goto(harness.extensionUrl("ui/popup/popup.html"));
    await page.waitForFunction(
      () => document.querySelector("#summary")?.textContent !== "",
    );

    await page.click("#enabled");

    expect(
      await waitFor(
        () => harness.readStorage("enabled"),
        (enabled) => enabled === false,
      ),
    ).toBe(false);
    await page.close();
  });
});
