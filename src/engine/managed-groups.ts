import type { KeyValueStore } from "./browser.js";

export interface ManagedGroup {
  groupId: number;
  windowId: number;
  key: string;
}

export interface ManagedGroups {
  find(windowId: number, key: string): Promise<number | undefined>;
  isManaged(groupId: number): Promise<boolean>;
  add(group: ManagedGroup): Promise<void>;
  remove(groupId: number): Promise<void>;
}

const STORAGE_KEY = "managedGroups";

const isManagedGroup = (value: unknown): value is ManagedGroup =>
  typeof value === "object" &&
  value !== null &&
  "groupId" in value &&
  typeof value.groupId === "number" &&
  "windowId" in value &&
  typeof value.windowId === "number" &&
  "key" in value &&
  typeof value.key === "string";

export const createManagedGroups = (store: KeyValueStore): ManagedGroups => {
  let state: Promise<ManagedGroup[]> | undefined;
  const load = () =>
    (state ??= store
      .get(STORAGE_KEY)
      .then((value) =>
        Array.isArray(value) && value.every(isManagedGroup) ? value : [],
      ));
  const persist = (groups: readonly ManagedGroup[]) =>
    store.set(STORAGE_KEY, [...groups]);

  return {
    async find(windowId, key) {
      const groups = await load();
      return groups.find(
        (group) => group.windowId === windowId && group.key === key,
      )?.groupId;
    },
    async isManaged(groupId) {
      const groups = await load();
      return groups.some((group) => group.groupId === groupId);
    },
    async add(newGroup) {
      const groups = await load();
      const existingIndex = groups.findIndex(
        (group) =>
          group.windowId === newGroup.windowId && group.key === newGroup.key,
      );
      if (existingIndex === -1) {
        groups.push(newGroup);
      } else {
        groups[existingIndex] = newGroup;
      }
      await persist(groups);
    },
    async remove(groupId) {
      const groups = await load();
      const remaining = groups.filter((group) => group.groupId !== groupId);
      if (remaining.length === groups.length) {
        return;
      }
      groups.splice(0, groups.length, ...remaining);
      await persist(groups);
    },
  };
};
