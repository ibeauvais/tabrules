import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchHarness, type Harness } from "./harness.js";

const tryFetch = (url: string): Promise<string> =>
  fetch(url).then(
    () => "allowed",
    () => "blocked",
  );

describe("security guarantees in Chrome", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await launchHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("declares only the three expected permissions", async () => {
    const manifest = await harness.worker.evaluate(() =>
      chrome.runtime.getManifest(),
    );

    expect(manifest.permissions).toEqual(["tabs", "tabGroups", "storage"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  it("enforces a strict content security policy on extension pages", async () => {
    const manifest = await harness.worker.evaluate(() =>
      chrome.runtime.getManifest(),
    );
    const securityPolicy = manifest.content_security_policy;
    const policy =
      typeof securityPolicy === "object"
        ? (securityPolicy.extension_pages ?? "")
        : "";

    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("require-trusted-types-for 'script'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("unsafe-inline");
  });

  it("reaches the test server from a regular web page (control)", async () => {
    const page = await harness.browser.newPage();
    await page.goto(harness.urlFor("alpha.test"));

    expect(await page.evaluate(tryFetch, harness.urlFor("alpha.test"))).toBe(
      "allowed",
    );
    await page.close();
  });

  it("blocks network requests from the service worker", async () => {
    expect(
      await harness.worker.evaluate(tryFetch, harness.urlFor("alpha.test")),
    ).toBe("blocked");
  });

  it.each(["ui/options/options.html", "ui/popup/popup.html"])(
    "blocks network requests and HTML injection in %s",
    async (path) => {
      const page = await harness.browser.newPage();
      await page.goto(harness.extensionUrl(path));

      expect(await page.evaluate(tryFetch, harness.urlFor("alpha.test"))).toBe(
        "blocked",
      );
      expect(
        await page.evaluate(() => {
          try {
            document.body.innerHTML = "<b>injected</b>";
            return "allowed";
          } catch {
            return "blocked";
          }
        }),
      ).toBe("blocked");
      await page.close();
    },
  );

  it("is not reachable from web pages", async () => {
    const page = await harness.browser.newPage();
    await page.goto(harness.urlFor("alpha.test"));

    const canMessage = await page.evaluate(
      () =>
        typeof (
          globalThis as { chrome?: { runtime?: { sendMessage?: unknown } } }
        ).chrome?.runtime?.sendMessage === "function",
    );

    expect(canMessage).toBe(false);
    await page.close();
  });
});
