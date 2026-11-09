import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { crc32 } from "node:zlib";

const DIST_DIR = "dist";
const RELEASE_DIR = "release";
const ZIP_VERSION = 20;
const UTF8_NAMES_FLAG = 0x0800;
const STORED = 0;
const DOS_TIME_MIDNIGHT = 0;
const DOS_DATE_1980_01_01 = (1 << 5) | 1;

const listFiles = async (directory) =>
  (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(directory, join(entry.parentPath, entry.name))
        .split(sep)
        .join("/"),
    )
    .sort();

const localHeader = (name, data, checksum) => {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(ZIP_VERSION, 4);
  header.writeUInt16LE(UTF8_NAMES_FLAG, 6);
  header.writeUInt16LE(STORED, 8);
  header.writeUInt16LE(DOS_TIME_MIDNIGHT, 10);
  header.writeUInt16LE(DOS_DATE_1980_01_01, 12);
  header.writeUInt32LE(checksum, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  return Buffer.concat([header, name, data]);
};

const centralHeader = (name, data, checksum, offset) => {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(ZIP_VERSION, 4);
  header.writeUInt16LE(ZIP_VERSION, 6);
  header.writeUInt16LE(UTF8_NAMES_FLAG, 8);
  header.writeUInt16LE(STORED, 10);
  header.writeUInt16LE(DOS_TIME_MIDNIGHT, 12);
  header.writeUInt16LE(DOS_DATE_1980_01_01, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(data.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, name]);
};

const endOfCentralDirectory = (entryCount, size, offset) => {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  return record;
};

const buildZip = async (paths) => {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;
  for (const path of paths) {
    const data = await readFile(join(DIST_DIR, path));
    const name = Buffer.from(path, "utf8");
    const checksum = crc32(data);
    const record = localHeader(name, data, checksum);
    localRecords.push(record);
    centralRecords.push(centralHeader(name, data, checksum, offset));
    offset += record.length;
  }
  const centralDirectory = Buffer.concat(centralRecords);
  return Buffer.concat([
    ...localRecords,
    centralDirectory,
    endOfCentralDirectory(paths.length, centralDirectory.length, offset),
  ]);
};

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const zipName = `tabrules-${version}.zip`;
const zip = await buildZip(await listFiles(DIST_DIR));
const sha256 = createHash("sha256").update(zip).digest("hex");

await mkdir(RELEASE_DIR, { recursive: true });
await writeFile(join(RELEASE_DIR, zipName), zip);
await writeFile(
  join(RELEASE_DIR, `${zipName}.sha256`),
  `${sha256}  ${zipName}\n`,
);
console.info(JSON.stringify({ event: "package_created", zipName, sha256 }));
