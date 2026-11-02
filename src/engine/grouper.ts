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
  let pendingTabIds = new Set<number>();
  let isAllTabsPending = false;
  let isFlushScheduled = false;

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
    const bucketsSharingTitle = Map.groupBy(
      buckets,
      (bucket) => `${String(bucket.windowId)}|${bucket.target.title}`,
    );
    const results = await Promise.allSettled(
      [...bucketsSharingTitle.values()].map(async (sameTitleBuckets) => {
        for (const bucket of sameTitleBuckets) {
          await ignoringClosedTabs(() => moveBucket(bucket));
        }
      }),
    );
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason as unknown);
    if (failures.length > 0) {
      throw new AggregateError(failures, failures.map(errorMessage).join("; "));
    }
  };

  const flush = async (): Promise<void> => {
    const tabIds = [...pendingTabIds];
    const includesAllTabs = isAllTabsPending;
    pendingTabIds = new Set();
    isAllTabsPending = false;
    isFlushScheduled = false;

    const candidates = includesAllTabs
      ? await tabs.listTabs()
      : (await Promise.all(tabIds.map((tabId) => tabs.getTab(tabId)))).filter(
          (tab) => tab !== null,
        );
    await applyToTabs(candidates);
  };

  const scheduleFlush = (): Promise<void> => {
    if (!isFlushScheduled) {
      isFlushScheduled = true;
      queue = queue.then(flush).catch((error: unknown) => {
        log("error", "grouping_failed", { error: errorMessage(error) });
      });
    }
    return queue;
  };

  return {
    applyToTab: (tabId) => {
      pendingTabIds.add(tabId);
      return scheduleFlush();
    },
    applyToAllTabs: () => {
      isAllTabsPending = true;
      return scheduleFlush();
    },
  };
};
