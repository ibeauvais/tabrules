import type { Rule } from "../core/rule.js";
import { parseRules } from "../core/validation.js";
import { STORAGE_KEYS } from "../shared/storage-keys.js";

export interface StoredRules {
  rules: Rule[];
  isCorrupted: boolean;
}

const readLocal = async (key: string): Promise<unknown> => {
  const items: Record<string, unknown> = await chrome.storage.local.get(key);
  return items[key];
};

export const loadRules = async (): Promise<StoredRules> => {
  const storedRules = await readLocal(STORAGE_KEYS.rules);
  if (storedRules === undefined) {
    return { rules: [], isCorrupted: false };
  }
  const result = parseRules(storedRules);
  return result.ok
    ? { rules: result.rules, isCorrupted: false }
    : { rules: [], isCorrupted: true };
};

export const saveRules = async (rules: readonly Rule[]): Promise<void> => {
  const result = parseRules(rules);
  if (!result.ok) {
    throw new Error(result.errors.join(" "));
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.rules]: result.rules });
};

export const loadEnabled = async (): Promise<boolean> =>
  (await readLocal(STORAGE_KEYS.enabled)) !== false;

export const saveEnabled = (enabled: boolean): Promise<void> =>
  chrome.storage.local.set({ [STORAGE_KEYS.enabled]: enabled });

export const onSettingsChanged = (listener: () => void): void => {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName === "local" &&
      (STORAGE_KEYS.rules in changes || STORAGE_KEYS.enabled in changes)
    ) {
      listener();
    }
  });
};
