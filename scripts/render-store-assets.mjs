import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

const DIST_DIR = resolve("dist");
const OUTPUT_DIR = "assets/store";
const SCREENSHOT = { width: 1280, height: 800 };
const SMALL_TILE = { width: 440, height: 280 };
const JPEG_QUALITY = 92;

const SAMPLE_RULES = [
  {
    id: "code",
    type: "hostname",
    pattern: "github.com",
    groupTitle: "Code",
    color: "blue",
    enabled: true,
  },
  {
    id: "google",
    type: "regex",
    pattern: "(^|\\.)google\\.com$",
    groupTitle: "Google",
    color: "red",
    enabled: true,
  },
  {
    id: "news",
    type: "hostname",
    pattern: "news.ycombinator.com",
    groupTitle: "News",
    color: "orange",
    enabled: true,
  },
  {
    id: "wiki",
    type: "regex",
    pattern: "\\.wikipedia\\.org$",
    groupTitle: "Wikipedia",
    color: "green",
    enabled: false,
  },
  { id: "all", type: "hostname", pattern: "*", enabled: true },
];

const dataUrl = (buffer, type) =>
  `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;

const browser = await puppeteer.launch({
  headless: true,
  pipe: true,
  enableExtensions: [DIST_DIR],
});
try {
  const workerTarget = await browser.waitForTarget(
    (target) =>
      target.type() === "service_worker" &&
      target.url().endsWith("/background/service-worker.js"),
  );
  const worker = await workerTarget.worker();
  const extensionUrl = (path) =>
    `chrome-extension://${new URL(workerTarget.url()).host}/${path}`;
  await worker.evaluate(
    (rules) => chrome.storage.local.set({ rules }),
    SAMPLE_RULES,
  );
  await mkdir(OUTPUT_DIR, { recursive: true });

  const page = await browser.newPage();
  await page.setViewport({ ...SCREENSHOT, deviceScaleFactor: 1 });
  for (const scheme of ["light", "dark"]) {
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: scheme },
    ]);
    await page.goto(extensionUrl("ui/options/options.html"));
    await page.waitForSelector("#rules-body tr");
    await page.screenshot({
      path: `${OUTPUT_DIR}/screenshot-options-${scheme}.jpg`,
      type: "jpeg",
      quality: JPEG_QUALITY,
    });
  }

  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "light" },
  ]);
  await page.setViewport({ width: 320, height: 400, deviceScaleFactor: 2 });
  await page.goto(extensionUrl("ui/popup/popup.html"));
  await page.waitForFunction(
    () => document.querySelector("#summary")?.textContent !== "",
  );
  const popup = await (await page.$("main.popup")).screenshot();
  const icon = await readFile("static/icons/icon-128.png");

  await page.goto("about:blank");
  await page.setViewport({ ...SCREENSHOT, deviceScaleFactor: 1 });
  await page.setContent(`
    <body style="margin:0;height:800px;display:flex;align-items:center;justify-content:center;gap:72px;
      background:linear-gradient(135deg,#3b82f6,#7c3aed);font-family:system-ui,sans-serif;color:#fff">
      <div style="max-width:520px">
        <img src="${dataUrl(icon, "image/png")}" width="96" height="96" alt="">
        <h1 style="font-size:56px;margin:16px 0 12px">TabRules</h1>
        <p style="font-size:26px;line-height:1.4;margin:0 0 24px">Group your tabs automatically with your own rules.</p>
        <p style="font-size:20px;line-height:1.6;margin:0;opacity:.9">Exact hostnames or regular expressions · Priority order ·
          Your own groups stay untouched · No network access, no data collection</p>
      </div>
      <img src="${dataUrl(popup, "image/png")}" width="320" alt=""
        style="border-radius:12px;box-shadow:0 24px 64px rgba(15,23,42,.45)">
    </body>`);
  await page.screenshot({
    path: `${OUTPUT_DIR}/screenshot-overview.jpg`,
    type: "jpeg",
    quality: JPEG_QUALITY,
  });

  await page.setViewport({ ...SMALL_TILE, deviceScaleFactor: 1 });
  await page.setContent(`
    <body style="margin:0;height:280px;display:flex;align-items:center;justify-content:center;gap:24px;
      background:linear-gradient(135deg,#3b82f6,#7c3aed);font-family:system-ui,sans-serif;color:#fff">
      <img src="${dataUrl(icon, "image/png")}" width="96" height="96" alt="">
      <div>
        <div style="font-size:40px;font-weight:700">TabRules</div>
        <div style="font-size:18px;opacity:.95;max-width:220px">Group tabs with your own rules</div>
      </div>
    </body>`);
  await page.screenshot({
    path: `${OUTPUT_DIR}/promo-small-440x280.jpg`,
    type: "jpeg",
    quality: JPEG_QUALITY,
  });
} finally {
  await browser.close();
}
