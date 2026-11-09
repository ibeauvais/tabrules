import { compileRules, type CompiledRules } from "../core/registry.js";
import { parseRulesLenient } from "../core/validation.js";
import { createCachedValue, type CachedValue } from "./cached-value.js";
import { log } from "./log.js";

const compileStoredRules = (storedRules: unknown): CompiledRules => {
  if (storedRules === undefined) {
    return compileRules([]);
  }
  const { rules, errors } = parseRulesLenient(storedRules);
  if (errors.length > 0) {
    log("error", "stored_rules_invalid", {
      errorCount: errors.length,
      appliedRuleCount: rules.length,
    });
  }
  return compileRules(rules);
};

export const createRulesCache = (
  loadRules: () => Promise<unknown>,
): CachedValue<CompiledRules> =>
  createCachedValue(() => loadRules().then(compileStoredRules));

export const createEnabledFlag = (
  loadEnabled: () => Promise<unknown>,
): CachedValue<boolean> =>
  createCachedValue(() => loadEnabled().then((stored) => stored !== false));
