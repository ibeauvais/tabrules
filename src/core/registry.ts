import type { CompiledMatcher, GroupTarget, RuleMatcher } from "./matcher.js";
import { hostnameMatcher } from "./matchers/hostname.js";
import type { Rule } from "./rule.js";

const MATCHERS: {
  [T in Rule["type"]]: RuleMatcher<Extract<Rule, { type: T }>>;
} = {
  hostname: hostnameMatcher,
};

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

export interface CompiledRules {
  match(url: string): GroupTarget | null;
}

export const compileRules = (rules: readonly Rule[]): CompiledRules => {
  const enabledRulesByType = Object.groupBy(
    rules.filter((rule) => rule.enabled),
    (rule) => rule.type,
  );
  const compiledMatchers: CompiledMatcher[] = Object.values(MATCHERS).map(
    (matcher) => matcher.compile(enabledRulesByType[matcher.type] ?? []),
  );

  return {
    match(url) {
      if (!URL.canParse(url)) {
        return null;
      }
      const parsedUrl = new URL(url);
      if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
        return null;
      }
      for (const matcher of compiledMatchers) {
        const target = matcher.match(parsedUrl);
        if (target) {
          return target;
        }
      }
      return null;
    },
  };
};
