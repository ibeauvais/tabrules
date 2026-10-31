import type { GroupTarget } from "../core/matcher.js";
import type { CompiledRules } from "../core/registry.js";
import {
  isMissingObjectError,
  NO_GROUP,
  type BrowserTabs,
  type TabInfo,
} from "./browser.js";
import { errorMessage, log } from "./log.js";
import type { ManagedGroups } from "./managed-groups.js";

export interface GrouperDependencies {
  tabs: BrowserTabs;
  managedGroups: ManagedGroups;
  getRules: () => Promise<CompiledRules>;
}

export interface Grouper {
  applyToTab(tabId: number): Promise<void>;
  applyToAllTabs(): Promise<void>;
}

interface Bucket {
  windowId: number;
  target: GroupTarget;
  tabs: TabInfo[];
}

interface GroupingPlan {
  buckets: Bucket[];
  tabIdsToUngroup: number[];
}

export const createGrouper = ({
  tabs,
  managedGroups,
  getRules,
}: GrouperDependencies): Grouper => {
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(task).catch((error: unknown) => {
      log("error", "grouping_failed", { error: errorMessage(error) });
    });
    return queue;
  };

  const planGrouping = async (
    candidates: readonly TabInfo[],
  ): Promise<GroupingPlan> => {
    const rules = await getRules();
    const buckets = new Map<string, Bucket>();
    const tabIdsToUngroup: number[] = [];

    for (const tab of candidates) {
      if (tab.pinned) {
        continue;
      }
      const isInManagedGroup = await managedGroups.isManaged(tab.groupId);
      if (tab.groupId !== NO_GROUP && !isInManagedGroup) {
        continue;
      }
      const target = rules.match(tab.url);
      if (target === null) {
        if (isInManagedGroup) {
          tabIdsToUngroup.push(tab.id);
        }
        continue;
      }
      const bucketKey = `${String(tab.windowId)}|${target.key}`;
      const bucket = buckets.get(bucketKey);
      if (bucket) {
        bucket.tabs.push(tab);
      } else {
        buckets.set(bucketKey, { windowId: tab.windowId, target, tabs: [tab] });
      }
    }
    return { buckets: [...buckets.values()], tabIdsToUngroup };
  };

  const findGroup = async (
    windowId: number,
    target: GroupTarget,
  ): Promise<number | undefined> => {
    const managedGroupId = await managedGroups.find(windowId, target.key);
    if (managedGroupId !== undefined || target.title === "") {
      return managedGroupId;
    }
    const [adoptedGroupId] = await tabs.findGroupIds(windowId, target.title);
    if (adoptedGroupId !== undefined) {
      await managedGroups.add({
        groupId: adoptedGroupId,
        windowId,
        key: target.key,
      });
    }
    return adoptedGroupId;
  };

  const moveBucket = async ({ windowId, target, tabs: bucketTabs }: Bucket) => {
    const groupId = await findGroup(windowId, target);
    const tabIds = bucketTabs
      .filter((tab) => tab.groupId !== groupId)
      .map((tab) => tab.id);
    if (tabIds.length === 0) {
      return;
    }
    if (groupId !== undefined) {
      try {
        await tabs.addToGroup(tabIds, groupId);
        return;
      } catch (error) {
        if (!isMissingObjectError(error, "group")) {
          throw error;
        }
        await managedGroups.remove(groupId);
      }
    }
    const newGroupId = await tabs.createGroup(tabIds, windowId);
    await tabs.updateGroup(
      newGroupId,
      target.color === undefined
        ? { title: target.title }
        : { title: target.title, color: target.color },
    );
    await managedGroups.add({ groupId: newGroupId, windowId, key: target.key });
  };

  const ignoringClosedTabs = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (error) {
      if (!isMissingObjectError(error, "tab")) {
        throw error;
      }
      log("warn", "tab_closed_during_grouping");
    }
  };

  const applyToTabs = async (candidates: readonly TabInfo[]) => {
    const { buckets, tabIdsToUngroup } = await planGrouping(candidates);
    if (tabIdsToUngroup.length > 0) {
      await ignoringClosedTabs(() => tabs.ungroup(tabIdsToUngroup));
    }
    for (const bucket of buckets) {
      await ignoringClosedTabs(() => moveBucket(bucket));
    }
  };

  return {
    applyToTab: (tabId) =>
      enqueue(async () => {
        const tab = await tabs.getTab(tabId);
        if (tab) {
          await applyToTabs([tab]);
        }
      }),
    applyToAllTabs: () =>
      enqueue(async () => {
        await applyToTabs(await tabs.listTabs());
      }),
  };
};
