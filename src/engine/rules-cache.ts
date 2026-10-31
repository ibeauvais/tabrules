import { compileRules, type CompiledRules } from "../core/registry.js";
import { parseRules } from "../core/validation.js";
import { log } from "./log.js";

export interface RulesCache {
  get(): Promise<CompiledRules>;
  invalidate(): void;
}

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
): RulesCache => {
  let compiledRules: Promise<CompiledRules> | undefined;

  return {
    get() {
      compiledRules ??= loadRules()
        .then(compileStoredRules)
        .catch((error: unknown) => {
          compiledRules = undefined;
          throw error;
        });
      return compiledRules;
    },
    invalidate() {
      compiledRules = undefined;
    },
  };
};
