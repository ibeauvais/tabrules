import type { TabGroupColor } from "../core/rule.js";

export const NO_GROUP = -1;

export interface TabInfo {
  id: number;
  windowId: number;
  groupId: number;
  url: string;
  pinned: boolean;
}

export interface GroupProperties {
  title: string;
  color?: TabGroupColor;
}

export interface BrowserTabs {
  getTab(tabId: number): Promise<TabInfo | null>;
  listTabs(): Promise<TabInfo[]>;
  addToGroup(tabIds: number[], groupId: number): Promise<void>;
  createGroup(tabIds: number[], windowId: number): Promise<number>;
  ungroup(tabIds: number[]): Promise<void>;
  updateGroup(groupId: number, properties: GroupProperties): Promise<void>;
  findGroupIds(windowId: number, title: string): Promise<number[]>;
}

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export const isMissingObjectError = (
  error: unknown,
  kind: "tab" | "group",
): boolean =>
  error instanceof Error && error.message.startsWith(`No ${kind} with id`);
