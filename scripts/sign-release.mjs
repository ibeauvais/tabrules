import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCrx3 } from "./crx.mjs";

const REPOSITORY = "ibeauvais/tabrules";
const RELEASE_DIR = "release";

const log = (event, fields = {}) => {
  console.info(JSON.stringify({ event, ...fields }));
};

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const download = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url}: HTTP ${String(response.status)}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const rebuildFromTag = async (tag, zipName) => {
  const worktree = await mkdtemp(join(tmpdir(), "tabrules-rebuild-"));
  try {
    execFileSync("git", ["worktree", "add", "--detach", worktree, tag], {
      stdio: "inherit",
    });
    const run = (...args) => {
      execFileSync("npm", args, { cwd: worktree, stdio: "inherit" });
    };
    run("ci");
    run("run", "package");
    return await readFile(join(worktree, RELEASE_DIR, zipName));
  } finally {
    execFileSync("git", ["worktree", "remove", "--force", worktree], {
      stdio: "inherit",
    });
    await rm(worktree, { recursive: true, force: true });
  }
};

const [version, keyPath] = process.argv.slice(2);
if (!version || !keyPath) {
  throw new Error("Usage: npm run sign-release -- <version> <private-key.pem>");
}
const tag = `v${version}`;
const zipName = `tabrules-${version}.zip`;
const releaseUrl = `https://github.com/${REPOSITORY}/releases/download/${tag}`;

const privateKey = createPrivateKey(await readFile(keyPath));

const releasedZip = await download(`${releaseUrl}/${zipName}`);
const publishedChecksum = (await download(`${releaseUrl}/${zipName}.sha256`))
  .toString("utf8")
  .split(/\s+/)[0];
const releasedChecksum = sha256(releasedZip);
if (releasedChecksum !== publishedChecksum) {
  throw new Error(
    `${zipName}: SHA-256 ${releasedChecksum} does not match the published ${String(publishedChecksum)}`,
  );
}
log("release_downloaded", { zipName, sha256: releasedChecksum });

const rebuiltZip = await rebuildFromTag(tag, zipName);
const rebuiltChecksum = sha256(rebuiltZip);
if (rebuiltChecksum !== releasedChecksum) {
  throw new Error(
    `${zipName}: rebuilt from ${tag} with SHA-256 ${rebuiltChecksum}, released ${releasedChecksum}`,
  );
}
log("release_reproduced", { tag, sha256: rebuiltChecksum });

const crxName = `tabrules-${version}.crx`;
const crx = createCrx3(rebuiltZip, privateKey);
await mkdir(RELEASE_DIR, { recursive: true });
await writeFile(join(RELEASE_DIR, crxName), crx);
log("release_signed", { crxName, sha256: sha256(crx) });
