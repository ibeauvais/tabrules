import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import puppeteer, { TargetType, type Browser, type WebWorker } from "puppeteer";

const DIST_DIR = resolve(import.meta.dirname, "../dist");
const SERVICE_WORKER_PATH = "/background/service-worker.js";

export interface GroupSnapshot {
  title: string;
  color: string;
  hostnames: string[];
}

export interface Harness {
  browser: Browser;
  worker: WebWorker;
  extensionId: string;
  urlFor(hostname: string, path?: string): string;
  extensionUrl(path: string): string;
  setStorage(values: Record<string, unknown>): Promise<void>;
  readStorage(key: string): Promise<unknown>;
  openTab(url: string, options?: { pinned?: boolean }): Promise<number>;
  navigateTab(tabId: number, url: string): Promise<void>;
  readGroups(): Promise<GroupSnapshot[]>;
  waitForGroups(
    isDone: (groups: GroupSnapshot[]) => boolean,
  ): Promise<GroupSnapshot[]>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export const waitFor = async <T>(
  read: () => Promise<T>,
  isDone: (value: T) => boolean,
  timeoutMs = 5_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (isDone(value)) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out, last value: ${JSON.stringify(value)}`);
    }
    await sleep(50);
  }
};

const startPageServer = (): Promise<Server> =>
  new Promise((resolveServer) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><title>TabRules test page</title>");
    });
    server.listen(0, "127.0.0.1", () => {
      resolveServer(server);
    });
  });

export const launchHarness = async (): Promise<Harness> => {
  const server = await startPageServer();
  const { port } = server.address() as AddressInfo;
  const browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    enableExtensions: [DIST_DIR],
    args: ["--host-resolver-rules=MAP *.test 127.0.0.1"],
  });
  const workerTarget = await browser.waitForTarget(
    (target) =>
      target.type() === TargetType.SERVICE_WORKER &&
      target.url().endsWith(SERVICE_WORKER_PATH),
  );
  const worker = await workerTarget.worker();
  if (!worker) {
    throw new Error("TabRules service worker not found");
  }
  const extensionId = new URL(workerTarget.url()).host;

  const readGroups = (): Promise<GroupSnapshot[]> =>
    worker.evaluate(async () => {
      const groups = await chrome.tabGroups.query({});
      const tabs = await chrome.tabs.query({});
      return groups
        .map((group) => ({
          title: group.title ?? "",
          color: group.color,
          hostnames: tabs
            .filter((tab) => tab.groupId === group.id)
            .map((tab) => new URL(tab.url ?? tab.pendingUrl ?? "").hostname)
            .sort(),
        }))
        .sort((left, right) => left.title.localeCompare(right.title));
    });

  return {
    browser,
    worker,
    extensionId,
    urlFor: (hostname, path = "/") =>
      `http://${hostname}:${String(port)}${path}`,
    extensionUrl: (path) => `chrome-extension://${extensionId}/${path}`,
    setStorage: (values) =>
      worker.evaluate((items) => chrome.storage.local.set(items), values),
    readStorage: (key) =>
      worker.evaluate(
        async (storageKey): Promise<unknown> =>
          (await chrome.storage.local.get(storageKey))[storageKey],
        key,
      ),
    openTab: (url, { pinned = false } = {}) =>
      worker.evaluate(
        async (tabUrl, isPinned) => {
          const tab = await chrome.tabs.create({
            url: tabUrl,
            pinned: isPinned,
            active: false,
          });
          if (tab.id === undefined) {
            throw new Error("Created tab has no id");
          }
          return tab.id;
        },
        url,
        pinned,
      ),
    navigateTab: async (tabId, url) => {
      await worker.evaluate(
        (id, tabUrl) => chrome.tabs.update(id, { url: tabUrl }),
        tabId,
        url,
      );
    },
    readGroups,
    waitForGroups: (isDone) => waitFor(readGroups, isDone),
    reset: async () => {
      await worker.evaluate(async () => {
        await chrome.storage.local.clear();
        const tabs = await chrome.tabs.query({});
        const testTabIds = tabs
          .filter((tab) => (tab.url ?? tab.pendingUrl ?? "").startsWith("http"))
          .flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
        if (testTabIds.length > 0) {
          await chrome.tabs.remove(testTabIds);
        }
      });
      await waitFor(readGroups, (groups) => groups.length === 0);
    },
    close: async () => {
      await browser.close();
      await new Promise<void>((resolveClose) => {
        server.close(() => {
          resolveClose();
        });
      });
    },
  };
};

export const catchAllRule = {
  id: "all",
  type: "hostname",
  pattern: "*",
  enabled: true,
} as const;
