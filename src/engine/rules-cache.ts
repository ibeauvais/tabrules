import { compileRules, type CompiledRules } from "../core/registry.js";
import { parseRules } from "../core/validation.js";
import { createCachedValue, type CachedValue } from "./cached-value.js";
import { log } from "./log.js";

const compileStoredRules = (storedRules: unknown): CompiledRules => {
  if (storedRules === undefined) {
    return compileRules([]);
  }
  const result = parseRules(storedRules);
  if (!result.ok) {
    log("error", "stored_rules_invalid", { errorCount: result.errors.length });
    return compileRules([]);
  }
  return compileRules(result.rules);
};

export const createRulesCache = (
  loadRules: () => Promise<unknown>,
): CachedValue<CompiledRules> =>
  createCachedValue(() => loadRules().then(compileStoredRules));

export const createEnabledFlag = (
  loadEnabled: () => Promise<unknown>,
): CachedValue<boolean> =>
  createCachedValue(() => loadEnabled().then((stored) => stored !== false));
