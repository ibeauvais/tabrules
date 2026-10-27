import { execFileSync } from "node:child_process";
import { cp, readFile, rm, writeFile } from "node:fs/promises";

const DIST_DIR = "dist";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

await rm(DIST_DIR, { recursive: true, force: true });
execFileSync("tsc", ["-p", "tsconfig.build.json"], { stdio: "inherit" });
await cp("static", DIST_DIR, { recursive: true });

const { version } = await readJson("package.json");
const { manifest_version, name, ...manifest } = await readJson(
  "static/manifest.json",
);
if ("version" in manifest) {
  throw new Error(
    "static/manifest.json must not declare a version: it is taken from package.json",
  );
}
await writeFile(
  `${DIST_DIR}/manifest.json`,
  `${JSON.stringify({ manifest_version, name, version, ...manifest }, null, 2)}\n`,
);
