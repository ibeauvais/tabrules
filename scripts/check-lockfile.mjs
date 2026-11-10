import { readFile } from "node:fs/promises";

const LOCKFILE = "package-lock.json";
const REGISTRY = "https://registry.npmjs.org/";
const NODE_MODULES = "node_modules/";

const packageName = (path) =>
  path.slice(path.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);

const problemsOf = (path, entry) => {
  if (entry.link) return [`${path}: links to a local directory`];
  const problems = [];
  const name = packageName(path);
  const expectedPrefix = `${REGISTRY}${name}/-/`;
  if (!entry.resolved?.startsWith(expectedPrefix)) {
    problems.push(
      `${path}: resolved ${entry.resolved ?? "<missing>"}, expected ${expectedPrefix}*`,
    );
  }
  if (!entry.integrity?.startsWith("sha512-")) {
    problems.push(
      `${path}: integrity ${entry.integrity ?? "<missing>"}, expected sha512`,
    );
  }
  return problems;
};

const lockfile = JSON.parse(await readFile(LOCKFILE, "utf8"));
if (lockfile.lockfileVersion !== 3) {
  throw new Error(
    `${LOCKFILE}: lockfileVersion ${lockfile.lockfileVersion}, expected 3`,
  );
}

const packages = Object.entries(lockfile.packages).filter(
  ([path]) => path !== "",
);
const problems = packages.flatMap(([path, entry]) => problemsOf(path, entry));
if (problems.length > 0) {
  console.error(
    JSON.stringify({ event: "lockfile_rejected", problems }, null, 2),
  );
  process.exit(1);
}
console.info(
  JSON.stringify({ event: "lockfile_checked", packageCount: packages.length }),
);
