import {
  isMissingObjectError,
  type BrowserTabs,
  type KeyValueStore,
  type TabInfo,
} from "../engine/browser.js";

const toNonEmpty = (tabIds: number[]): [number, ...number[]] => {
  const [first, ...rest] = tabIds;
  if (first === undefined) {
    throw new Error("tabIds must not be empty");
  }
  return [first, ...rest];
};

const toTabInfo = (tab: chrome.tabs.Tab): TabInfo | null =>
  tab.id === undefined || tab.url === undefined
    ? null
    : {
        id: tab.id,
        windowId: tab.windowId,
        groupId: tab.groupId,
        url: tab.url,
        pinned: tab.pinned,
      };

export const chromeTabs: BrowserTabs = {
  async getTab(tabId) {
    try {
      return toTabInfo(await chrome.tabs.get(tabId));
    } catch (error) {
      if (isMissingObjectError(error, "tab")) {
        return null;
      }
      throw error;
    }
  },
  async listTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.map(toTabInfo).filter((tab) => tab !== null);
  },
  async addToGroup(tabIds, groupId) {
    await chrome.tabs.group({ groupId, tabIds: toNonEmpty(tabIds) });
  },
  createGroup: (tabIds, windowId) =>
    chrome.tabs.group({
      tabIds: toNonEmpty(tabIds),
      createProperties: { windowId },
    }),
  async ungroup(tabIds) {
    await chrome.tabs.ungroup(toNonEmpty(tabIds));
  },
  async updateGroup(groupId, properties) {
    await chrome.tabGroups.update(groupId, properties);
  },
  async findGroupIds(windowId, title) {
    const groups = await chrome.tabGroups.query({ windowId, title });
    return groups.map((group) => group.id);
  },
};

export const createStorageStore = (
  area: chrome.storage.StorageArea,
): KeyValueStore => ({
  async get(key) {
    const items: Record<string, unknown> = await area.get(key);
    return items[key];
  },
  set: (key, value) => area.set({ [key]: value }),
});
