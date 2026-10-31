import { describe, expect, it } from "vitest";
import { createManagedGroups } from "./managed-groups.js";
import { MemoryStore } from "./testing/fake-browser.js";

describe("createManagedGroups", () => {
  it("finds a group by window and key", async () => {
    const managedGroups = createManagedGroups(new MemoryStore());
    await managedGroups.add({ groupId: 1, windowId: 10, key: "a" });
    await managedGroups.add({ groupId: 2, windowId: 20, key: "a" });

    expect(await managedGroups.find(10, "a")).toBe(1);
    expect(await managedGroups.find(20, "a")).toBe(2);
    expect(await managedGroups.find(10, "b")).toBeUndefined();
    expect(await managedGroups.isManaged(2)).toBe(true);
    expect(await managedGroups.isManaged(3)).toBe(false);
  });

  it("replaces the group of an existing window and key", async () => {
    const store = new MemoryStore();
    const managedGroups = createManagedGroups(store);
    await managedGroups.add({ groupId: 1, windowId: 10, key: "a" });
    await managedGroups.add({ groupId: 2, windowId: 10, key: "a" });

    expect(await managedGroups.find(10, "a")).toBe(2);
    expect(store.values.get("managedGroups")).toEqual([
      { groupId: 2, windowId: 10, key: "a" },
    ]);
  });

  it("removes every entry of a group and persists the result", async () => {
    const store = new MemoryStore();
    const managedGroups = createManagedGroups(store);
    await managedGroups.add({ groupId: 1, windowId: 10, key: "a" });
    await managedGroups.add({ groupId: 1, windowId: 10, key: "b" });
    await managedGroups.add({ groupId: 2, windowId: 10, key: "c" });

    await managedGroups.remove(1);

    expect(await managedGroups.isManaged(1)).toBe(false);
    expect(store.values.get("managedGroups")).toEqual([
      { groupId: 2, windowId: 10, key: "c" },
    ]);
  });

  it("does not write to storage when removing an unknown group", async () => {
    const store = new MemoryStore();
    const managedGroups = createManagedGroups(store);

    await managedGroups.remove(1);

    expect(store.values.has("managedGroups")).toBe(false);
  });

  it("restores state persisted by a previous service worker instance", async () => {
    const store = new MemoryStore();
    await createManagedGroups(store).add({
      groupId: 1,
      windowId: 10,
      key: "a",
    });

    expect(await createManagedGroups(store).find(10, "a")).toBe(1);
  });

  it.each([
    "corrupted",
    [{ groupId: "1", windowId: 10, key: "a" }],
    [{ groupId: 1, key: "a" }],
    [{ groupId: 1, windowId: 10 }],
    [null],
  ])("starts empty when the stored value is invalid: %j", async (stored) => {
    const store = new MemoryStore();
    store.values.set("managedGroups", stored);

    expect(await createManagedGroups(store).isManaged(1)).toBe(false);
  });

  it("keeps concurrent updates", async () => {
    const managedGroups = createManagedGroups(new MemoryStore());

    await Promise.all([
      managedGroups.add({ groupId: 1, windowId: 10, key: "a" }),
      managedGroups.add({ groupId: 2, windowId: 10, key: "b" }),
      managedGroups.remove(1),
    ]);

    expect(await managedGroups.isManaged(2)).toBe(true);
  });
});
