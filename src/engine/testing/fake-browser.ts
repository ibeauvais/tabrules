import {
  NO_GROUP,
  type BrowserTabs,
  type GroupProperties,
  type KeyValueStore,
  type TabInfo,
} from "../browser.js";

export interface FakeGroup extends GroupProperties {
  windowId: number;
}

export class FakeBrowser implements BrowserTabs {
  readonly tabs = new Map<number, TabInfo>();
  readonly groups = new Map<number, FakeGroup>();
  readonly calls: string[] = [];
  readonly reads: string[] = [];
  failNextCall: Error | undefined;
  private nextGroupId = 100;

  addTab(tab: Pick<TabInfo, "id" | "url"> & Partial<TabInfo>): this {
    this.tabs.set(tab.id, {
      windowId: 1,
      groupId: NO_GROUP,
      pinned: false,
      ...tab,
    });
    return this;
  }

  addGroup(groupId: number, group: FakeGroup): this {
    this.groups.set(groupId, group);
    return this;
  }

  groupOf(tabId: number): FakeGroup | undefined {
    const groupId = this.tabs.get(tabId)?.groupId;
    return groupId === undefined ? undefined : this.groups.get(groupId);
  }

  getTab(tabId: number): Promise<TabInfo | null> {
    this.reads.push(`getTab ${String(tabId)}`);
    const tab = this.tabs.get(tabId);
    return Promise.resolve(tab ? { ...tab } : null);
  }

  listTabs(): Promise<TabInfo[]> {
    this.reads.push("listTabs");
    return Promise.resolve([...this.tabs.values()].map((tab) => ({ ...tab })));
  }

  addToGroup(tabIds: number[], groupId: number): Promise<void> {
    return this.run(
      `addToGroup ${tabIds.join(",")} -> ${String(groupId)}`,
      () => {
        if (!this.groups.has(groupId)) {
          throw new Error(`No group with id: ${String(groupId)}.`);
        }
        this.moveTabs(tabIds, groupId);
      },
    );
  }

  createGroup(tabIds: number[], windowId: number): Promise<number> {
    return this.run(`createGroup ${tabIds.join(",")}`, () => {
      const groupId = this.nextGroupId++;
      this.groups.set(groupId, { windowId, title: "" });
      this.moveTabs(tabIds, groupId);
      return groupId;
    });
  }

  ungroup(tabIds: number[]): Promise<void> {
    return this.run(`ungroup ${tabIds.join(",")}`, () => {
      this.moveTabs(tabIds, NO_GROUP);
    });
  }

  updateGroup(groupId: number, properties: GroupProperties): Promise<void> {
    return this.run(`updateGroup ${String(groupId)}`, () => {
      const group = this.groups.get(groupId);
      if (!group) {
        throw new Error(`No group with id: ${String(groupId)}.`);
      }
      this.groups.set(groupId, { windowId: group.windowId, ...properties });
    });
  }

  findGroupIds(windowId: number, title: string): Promise<number[]> {
    const groupIds = [...this.groups.entries()]
      .filter(
        ([, group]) => group.windowId === windowId && group.title === title,
      )
      .map(([groupId]) => groupId);
    return Promise.resolve(groupIds);
  }

  private run<T>(call: string, operation: () => T): Promise<T> {
    this.calls.push(call);
    return new Promise((resolve) => {
      const failure = this.failNextCall;
      this.failNextCall = undefined;
      if (failure) {
        throw failure;
      }
      resolve(operation());
    });
  }

  private moveTabs(tabIds: number[], groupId: number): void {
    for (const tabId of tabIds) {
      const tab = this.tabs.get(tabId);
      if (!tab) {
        throw new Error(`No tab with id: ${String(tabId)}.`);
      }
      tab.groupId = groupId;
    }
    const usedGroupIds = new Set(
      [...this.tabs.values()].map((tab) => tab.groupId),
    );
    for (const existingGroupId of this.groups.keys()) {
      if (!usedGroupIds.has(existingGroupId)) {
        this.groups.delete(existingGroupId);
      }
    }
  }
}

export class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, unknown>();

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.values.get(key));
  }

  set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
    return Promise.resolve();
  }
}
