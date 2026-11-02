import { mkdir, readFile } from "node:fs/promises";
import puppeteer from "puppeteer";

const OUTPUT_DIR = "static/icons";
const ICONS = [
  { size: 16, padding: 0, source: "assets/icon-small.svg" },
  { size: 32, padding: 0, source: "assets/icon.svg" },
  { size: 48, padding: 0, source: "assets/icon.svg" },
  { size: 128, padding: 16, source: "assets/icon.svg" },
];

await mkdir(OUTPUT_DIR, { recursive: true });

const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  for (const { size, padding, source } of ICONS) {
    const svg = await readFile(source, "utf8");
    const artworkSize = size - 2 * padding;
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(
      `<body style="margin:0;padding:${padding}px;background:transparent">${svg.replace(
        "<svg ",
        `<svg style="display:block" width="${artworkSize}" height="${artworkSize}" `,
      )}</body>`,
    );
    await page.screenshot({
      path: `${OUTPUT_DIR}/icon-${size}.png`,
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  }
} finally {
  await browser.close();
}
