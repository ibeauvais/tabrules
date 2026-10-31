import { createGrouper } from "../engine/grouper.js";
import { errorMessage, log } from "../engine/log.js";
import { createManagedGroups } from "../engine/managed-groups.js";
import { createEnabledFlag, createRulesCache } from "../engine/rules-cache.js";
import { STORAGE_KEYS } from "../shared/storage-keys.js";
import { chromeTabs, createStorageStore } from "./chrome-adapter.js";

const localStore = createStorageStore(chrome.storage.local);
const rulesCache = createRulesCache(() => localStore.get(STORAGE_KEYS.rules));
const enabledFlag = createEnabledFlag(() =>
  localStore.get(STORAGE_KEYS.enabled),
);
const managedGroups = createManagedGroups(
  createStorageStore(chrome.storage.session),
);
const grouper = createGrouper({
  tabs: chromeTabs,
  managedGroups,
  getRules: () => rulesCache.get(),
});

const logFailure = (event: string) => (error: unknown) => {
  log("error", event, { error: errorMessage(error) });
};

const whenEnabled = (action: () => Promise<void>): void => {
  enabledFlag
    .get()
    .then((enabled) => (enabled ? action() : undefined))
    .catch(logFailure("settings_read_failed"));
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url !== undefined) {
    whenEnabled(() => grouper.applyToTab(tabId));
  }
});

chrome.tabs.onAttached.addListener((tabId) => {
  whenEnabled(() => grouper.applyToTab(tabId));
});

chrome.tabGroups.onRemoved.addListener((group) => {
  managedGroups
    .remove(group.id)
    .catch(logFailure("managed_group_cleanup_failed"));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  const rulesChanged = STORAGE_KEYS.rules in changes;
  const enabledChanged = STORAGE_KEYS.enabled in changes;
  if (rulesChanged) {
    rulesCache.invalidate();
  }
  if (enabledChanged) {
    enabledFlag.invalidate();
  }
  if (rulesChanged || enabledChanged) {
    whenEnabled(() => grouper.applyToAllTabs());
  }
});
