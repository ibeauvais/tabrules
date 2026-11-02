import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { launchHarness, waitFor, type Harness } from "./harness.js";

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

    const groups = await harness.waitForGroups(
      (current) => current.length === 1,
    );
    expect(groups).toEqual([
      { title: "Alpha", color: "green", hostnames: ["alpha.test"] },
    ]);
    expect(await page.$$eval("#rules-body tr", (rows) => rows.length)).toBe(1);
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
