import { createGrouper } from "../engine/grouper.js";
import { errorMessage, log } from "../engine/log.js";
import { createManagedGroups } from "../engine/managed-groups.js";
import { createRulesCache } from "../engine/rules-cache.js";
import { chromeTabs, createStorageStore } from "./chrome-adapter.js";

const RULES_STORAGE_KEY = "rules";

const rulesStore = createStorageStore(chrome.storage.local);
const rulesCache = createRulesCache(() => rulesStore.get(RULES_STORAGE_KEY));
const managedGroups = createManagedGroups(
  createStorageStore(chrome.storage.session),
);
const grouper = createGrouper({
  tabs: chromeTabs,
  managedGroups,
  getRules: () => rulesCache.get(),
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url !== undefined) {
    void grouper.applyToTab(tabId);
  }
});

chrome.tabs.onAttached.addListener((tabId) => {
  void grouper.applyToTab(tabId);
});

chrome.tabGroups.onRemoved.addListener((group) => {
  managedGroups.remove(group.id).catch((error: unknown) => {
    log("error", "managed_group_cleanup_failed", {
      error: errorMessage(error),
    });
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && RULES_STORAGE_KEY in changes) {
    rulesCache.invalidate();
    void grouper.applyToAllTabs();
  }
});
